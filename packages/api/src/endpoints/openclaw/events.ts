import { randomUUID } from 'node:crypto';
import { StepTypes, ToolCallTypes } from 'librechat-data-provider';
import type { OpenClawChatEvent, OpenClawContentBlock } from './types';
import type { StreamEvent, FinalEvent, ServerSentEvent } from '~/types';

export interface TranslationContext {
  messageId: string;
  conversationId: string;
  /** Maps OpenClaw tool_use block id → step index */
  toolCallMap: Map<string, number>;
  toolCallIndex: number;
}

export function createTranslationContext(
  messageId: string,
  conversationId: string,
): TranslationContext {
  return { messageId, conversationId, toolCallMap: new Map(), toolCallIndex: 0 };
}

/**
 * Translate a single OpenClaw streaming event into zero or more LibreChat SSE events.
 */
export function translateEvent(
  chatEvent: OpenClawChatEvent,
  ctx: TranslationContext,
): ServerSentEvent[] {
  if (chatEvent.state === 'delta') {
    const events: ServerSentEvent[] = [];
    for (const block of chatEvent.message.content) {
      const blockEvents = translateContentBlock(block, ctx);
      events.push(...blockEvents);
    }
    return events;
  }

  if (chatEvent.state === 'final') {
    const final: FinalEvent = { final: true };
    return [final];
  }

  if (chatEvent.state === 'aborted') {
    const final: FinalEvent = { final: true, aborted: true };
    return [final];
  }

  if (chatEvent.state === 'error') {
    const final: FinalEvent = {
      final: true,
      error: { message: chatEvent.errorMessage ?? 'OpenClaw error' },
    };
    return [final];
  }

  return [];
}

function translateContentBlock(
  block: OpenClawContentBlock,
  ctx: TranslationContext,
): ServerSentEvent[] {
  if (block.type === 'text') {
    const event: StreamEvent = {
      event: 'on_message_delta',
      data: {
        id: ctx.messageId,
        delta: {
          content: [{ type: 'text_delta', value: block.text }],
        },
      },
    };
    return [event];
  }

  if (block.type === 'thinking') {
    const event: StreamEvent = {
      event: 'on_reasoning_delta',
      data: {
        id: ctx.messageId,
        delta: {
          content: [{ type: 'think', think: block.thinking }],
        },
      },
    };
    return [event];
  }

  if (block.type === 'tool_use') {
    const stepIndex = ctx.toolCallIndex++;
    ctx.toolCallMap.set(block.id, stepIndex);
    const stepId = randomUUID();

    const runStepEvent: StreamEvent = {
      event: 'on_run_step',
      data: {
        id: stepId,
        index: stepIndex,
        type: StepTypes.TOOL_CALLS,
        stepDetails: {
          type: StepTypes.TOOL_CALLS,
          tool_calls: [
            {
              id: block.id,
              type: ToolCallTypes.TOOL_CALL,
              name: block.name,
            },
          ],
        },
      },
    };

    // Emit arguments as a single run_step_delta
    const deltaEvent: StreamEvent = {
      event: 'on_run_step_delta',
      data: {
        id: stepId,
        delta: {
          type: StepTypes.TOOL_CALLS,
          tool_calls: [
            {
              index: stepIndex,
              id: block.id,
              args: JSON.stringify(block.input),
            },
          ],
        },
      },
    };

    return [runStepEvent, deltaEvent];
  }

  if (block.type === 'tool_result') {
    const stepIndex = ctx.toolCallMap.get(block.tool_use_id) ?? 0;
    const event: StreamEvent = {
      event: 'on_run_step_completed',
      data: {
        index: stepIndex,
        tool_use_id: block.tool_use_id,
        result: block.content,
        is_error: block.is_error ?? false,
      },
    };
    return [event];
  }

  return [];
}
