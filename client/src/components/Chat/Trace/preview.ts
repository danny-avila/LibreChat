import { ContentTypes } from 'librechat-data-provider';
import type { TMessage, TMessageContentParts } from 'librechat-data-provider';
import type { TraceModel, TraceNode } from './model';

const PREVIEW_LENGTH = 160;
const ELLIPSIS = '…';

type ToolCallPreview = { name: string; args: string };

/** What one model call of a response produced: the text it wrote and the tools it called. */
export type StepPreview = { text: string; toolCalls: ToolCallPreview[] };

function compact(text: string): string {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  return collapsed.length > PREVIEW_LENGTH
    ? `${collapsed.slice(0, PREVIEW_LENGTH).trimEnd()}${ELLIPSIS}`
    : collapsed;
}

function textOf(value: string | { value?: string } | undefined): string {
  if (typeof value === 'string') {
    return value;
  }
  return value?.value ?? '';
}

function argsPreview(args: string | object | undefined): string {
  if (args == null) {
    return '';
  }
  let parsed: unknown = args;
  if (typeof args === 'string') {
    try {
      parsed = JSON.parse(args);
    } catch {
      return compact(args);
    }
  }
  if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return compact(typeof parsed === 'string' ? parsed : JSON.stringify(parsed));
  }
  const pairs = Object.entries(parsed).map(
    ([key, value]) => `${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`,
  );
  return compact(pairs.join(', '));
}

type ToolCallPart = Extract<TMessageContentParts, { type: ContentTypes.TOOL_CALL }>['tool_call'];

/** A tool call's name and arguments, whichever of the persisted call shapes carries them. */
function callOf(call: ToolCallPart | undefined): ToolCallPreview | null {
  if (call == null) {
    return null;
  }
  if ('function' in call && call.function != null) {
    return { name: call.function.name, args: argsPreview(call.function.arguments) };
  }
  if ('name' in call && typeof call.name === 'string') {
    return { name: call.name, args: argsPreview(call.args) };
  }
  return null;
}

/**
 * Splits a response's content into what each model call produced. A model call
 * writes text and requests tools; the next call begins where a tool call is
 * followed by more text, so those boundaries separate the steps.
 */
export function buildStepPreviews(message: TMessage | undefined): StepPreview[] {
  const parts: TMessageContentParts[] = message?.content ?? [];
  const steps: StepPreview[] = [];
  let current: StepPreview | null = null;
  let afterToolCall = false;
  for (const part of parts) {
    if (part.type === ContentTypes.TOOL_CALL) {
      if (current == null) {
        current = { text: '', toolCalls: [] };
        steps.push(current);
      }
      const call = callOf(part.tool_call);
      if (call != null) {
        current.toolCalls.push(call);
      }
      afterToolCall = true;
      continue;
    }
    if (part.type !== ContentTypes.TEXT) {
      continue;
    }
    if (current == null || afterToolCall) {
      current = { text: '', toolCalls: [] };
      steps.push(current);
      afterToolCall = false;
    }
    current.text = compact(`${current.text} ${textOf(part.text)}`);
  }
  if (steps.length === 0 && message?.text) {
    steps.push({ text: compact(message.text), toolCalls: [] });
  }
  return steps;
}

/**
 * The one-line preview a ledger row shows beside a record's name, taken from the
 * chat's own message rather than from the tracing backend: the text a model call
 * wrote, or the arguments a tool was called with. Tool records are matched to
 * the message's tool calls by name, in the order they ran within their step.
 */
export function previewFor(
  node: TraceNode,
  model: TraceModel,
  previewsByMessage: ReadonlyMap<string, StepPreview[]>,
): string | undefined {
  const { record } = node;
  if (record.origin === 'title' || (record.kind !== 'generation' && record.kind !== 'tool')) {
    return undefined;
  }
  const previews = previewsByMessage.get(record.messageId);
  const step = node.stepKey != null ? model.steps.get(node.stepKey) : undefined;
  if (previews == null || step == null || step.origin === 'title') {
    return undefined;
  }
  const preview = previews[step.index - 1];
  if (!preview) {
    return undefined;
  }
  if (record.kind === 'generation') {
    return preview.text || undefined;
  }
  const ordinal = toolOrdinal(node, model, step.rootIds);
  const match = preview.toolCalls.filter((call) => call.name === record.name)[ordinal];
  return match?.args || undefined;
}

/** How many earlier tool records of the same name the step holds, in ledger order. */
function toolOrdinal(node: TraceNode, model: TraceModel, rootIds: string[]): number {
  let ordinal = 0;
  const stack = [...rootIds].reverse();
  while (stack.length > 0) {
    const current = model.nodes.get(stack.pop() ?? '');
    if (!current) {
      continue;
    }
    if (current === node) {
      return ordinal;
    }
    if (current.record.kind === 'tool' && current.record.name === node.record.name) {
      ordinal++;
    }
    for (let i = current.viewChildIds.length - 1; i >= 0; i--) {
      stack.push(current.viewChildIds[i]);
    }
  }
  return ordinal;
}

/** Previews for every response in a conversation, keyed by its message id. */
export function buildPreviews(
  messages: readonly TMessage[] | undefined,
): Map<string, StepPreview[]> {
  const previews = new Map<string, StepPreview[]>();
  for (const message of messages ?? []) {
    if (message.isCreatedByUser) {
      continue;
    }
    previews.set(message.messageId, buildStepPreviews(message));
  }
  return previews;
}
