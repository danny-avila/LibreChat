import { ContentTypes } from 'librechat-data-provider';
import type { HookCallback } from '@librechat/agents';
import type {
  ActivityLabelBlockContext,
  ActivityLabelInvokeCallbacks,
  ActivityLabelLLM,
  GenerateLabelPayload,
} from './runtime';
import { createActivityLabelHook } from './runtime';

/** Structural view of a content part; hosts pass their live parts array. */
export interface LooseContentPart {
  type?: string;
  text?: unknown;
  think?: unknown;
  agentId?: unknown;
  groupId?: unknown;
  tool_call?: { id?: unknown };
  pending?: boolean;
  [key: string]: unknown;
}

const MAX_EXCERPTS = 4;
const EXCERPT_CHARS = 300;
const INTENT_CHARS = 200;

function textValue(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  const nested = (value as { value?: unknown } | null | undefined)?.value;
  return typeof nested === 'string' ? nested : '';
}

/**
 * Captures the current activity block's context for the label payload:
 * reasoning excerpts since the last text part, plus the assistant's last
 * text (~200 chars) as intent. Deliberately NO human messages. Reasoning
 * collection stops at the previous block's label part — labels delimit
 * blocks, so scanning past one would bleed another batch's reasoning into
 * this payload — and filters by executing agent in multi-agent runs.
 * Intent keeps scanning past labels: with consecutive batches and no
 * interleaved text, the assistant's last words remain the current intent.
 */
export function captureActivityBlockContext(
  parts: ReadonlyArray<LooseContentPart | null | undefined>,
  executingAgentId?: string,
): ActivityLabelBlockContext {
  const thinkingExcerpts: string[] = [];
  let lastAssistantText: string | undefined;
  let collectThinking = true;
  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i];
    if (part == null) {
      continue;
    }
    if (part.type === ContentTypes.ACTIVITY_LABEL) {
      collectThinking = false;
      continue;
    }
    if (part.type === ContentTypes.TEXT) {
      /** Parallel/added-agent runs interleave text parts from several
       *  agents; another agent's text at the tail is not this batch's
       *  intent, so skip it rather than stopping the scan there. */
      if (executingAgentId != null && part.agentId != null && part.agentId !== executingAgentId) {
        continue;
      }
      const text = textValue(part.text).trim();
      if (text.length > 0) {
        lastAssistantText = text.slice(-INTENT_CHARS);
        break;
      }
      continue;
    }
    if (
      collectThinking &&
      part.type === ContentTypes.THINK &&
      thinkingExcerpts.length < MAX_EXCERPTS &&
      (executingAgentId == null || part.agentId == null || part.agentId === executingAgentId)
    ) {
      const think = textValue(part.think).trim();
      if (think.length > 0) {
        thinkingExcerpts.unshift(think.slice(0, EXCERPT_CHARS));
      }
    }
  }
  return { thinkingExcerpts, lastAssistantText };
}

/**
 * Removes UI-only activity-label parts from a message payload before any
 * `formatAgentMessages` call. Published SDK versions without the formatter
 * skip would otherwise fold the label text into provider-facing content via
 * the formatter's catch-all. Non-mutating; returns the same reference when
 * nothing needed stripping.
 */
export function stripActivityLabelParts<T extends { content?: unknown }>(payload: T[]): T[] {
  if (!Array.isArray(payload)) {
    return payload;
  }
  let changed = false;
  const result = payload.map((message) => {
    const content = message?.content;
    if (!Array.isArray(content)) {
      return message;
    }
    const filtered = content.filter(
      (part) => (part as LooseContentPart | null | undefined)?.type !== ContentTypes.ACTIVITY_LABEL,
    );
    if (filtered.length === content.length) {
      return message;
    }
    changed = true;
    return { ...message, content: filtered };
  });
  return changed ? result : payload;
}

/** Minimal SSE shape for synthesized gap events. */
interface ActivityLabelGapEvent {
  event: string;
  data: Record<string, unknown>;
}

/**
 * Synthesizes `on_activity_label` events for labels that appeared OR were
 * filled between a resume snapshot and subscriber attach. In Redis mode the
 * label publish is fire-and-forget and the sync payload carries only the
 * snapshot, so a label claimed or resolved in that window would otherwise
 * never reach the reconnecting client. Compares by index: a fresh label part
 * whose text or pending state differs from the snapshot's (or that has no
 * snapshot counterpart) is re-emitted. Idempotent - the client applier
 * ignores duplicates and refuses stale pending placeholders.
 */
export function synthesizeActivityLabelGapEvents(
  snapshotContent: ReadonlyArray<LooseContentPart | null | undefined>,
  freshContent: ReadonlyArray<LooseContentPart | null | undefined>,
  meta: { conversationId: string; responseMessageId?: string },
): ActivityLabelGapEvent[] {
  const events: ActivityLabelGapEvent[] = [];
  for (let i = 0; i < freshContent.length; i++) {
    const part = freshContent[i];
    if (part?.type !== ContentTypes.ACTIVITY_LABEL) {
      continue;
    }
    const snapshot = snapshotContent[i];
    const isSameLabel =
      snapshot?.type === ContentTypes.ACTIVITY_LABEL &&
      snapshot[ContentTypes.ACTIVITY_LABEL] === part[ContentTypes.ACTIVITY_LABEL] &&
      snapshot.pending === part.pending;
    if (isSameLabel) {
      continue;
    }
    events.push({
      event: 'on_activity_label',
      data: {
        index: i,
        part,
        conversationId: meta.conversationId,
        ...(meta.responseMessageId != null && { responseMessageId: meta.responseMessageId }),
      },
    });
  }
  return events;
}

/** Host closures the wiring needs; each is a thin bridge into the caller. */
export interface ActivityLabelHostDeps {
  abortSignal?: AbortSignal;
  /** Returns the LIVE host content array (same instance the SDK writes into). */
  getContentParts: () => Array<LooseContentPart | null | undefined>;
  /** Bumps the shared index offset so subsequent SDK indices skip the slot. */
  bumpIndexOffset: () => void;
  /** Emits the on_activity_label SSE/chunk event for a slot state. */
  emitLabelEvent: (index: number, part: LooseContentPart) => Promise<unknown>;
  /** Registers a fill-completion promise for bounded settle at finalization. */
  trackPendingFill: (fillDone: Promise<void>) => void;
  resolveLLM: () => Promise<ActivityLabelLLM>;
  generateLabel?: (payload: GenerateLabelPayload) => Promise<string | null>;
  getInvokeCallbacks?: () => ActivityLabelInvokeCallbacks;
}

/**
 * Builds the run wiring for activity labels: slot claiming at each batch
 * boundary (steering's index-offset pattern), claim-time counts emit,
 * fill-time label emit ordered after the claim emit, groupId/agentId lane
 * stamping, and settle tracking. Implementation lives here (TS) so the JS
 * controller stays a thin wrapper.
 */
export function createActivityLabelWiring(deps: ActivityLabelHostDeps): {
  hook: HookCallback<'PostToolBatch'>;
} {
  return {
    hook: createActivityLabelHook({
      resolveLLM: deps.resolveLLM,
      signal: deps.abortSignal,
      getInvokeCallbacks: deps.getInvokeCallbacks,
      ...(deps.generateLabel && { generateLabel: deps.generateLabel }),
      claimSlot: (meta) => {
        const parts = deps.getContentParts();
        const index = parts.length;
        /** Parallel-column runs: carry the batch's groupId onto the label
         *  part so ParallelContentRenderer places it inside its group
         *  instead of filtering it out as an unplaced sequential part. */
        let groupId: unknown;
        for (let i = parts.length - 1; i >= 0 && groupId == null; i--) {
          const prior = parts[i];
          if (
            prior?.type === ContentTypes.TOOL_CALL &&
            prior.groupId != null &&
            typeof prior.tool_call?.id === 'string' &&
            meta.toolCallIds.includes(prior.tool_call.id)
          ) {
            groupId = prior.groupId;
          }
        }
        /** Context is captured BEFORE the label part is pushed — the scan
         *  stops at ACTIVITY_LABEL parts, so capturing after the push would
         *  hit the just-inserted label at the tail and collect nothing. */
        const context = captureActivityBlockContext(parts, meta.executingAgentId);
        const part: LooseContentPart = {
          type: ContentTypes.ACTIVITY_LABEL,
          [ContentTypes.ACTIVITY_LABEL]: '',
          tool_call_ids: meta.toolCallIds,
          counts: meta.counts,
          status: meta.status,
          ...(meta.executingAgentId != null && { agentId: meta.executingAgentId }),
          ...(groupId != null && { groupId }),
          pending: true,
        };
        parts.push(part);
        deps.bumpIndexOffset();
        /** Claim-time emit: the counts phrase renders in the live UI
         *  immediately at batch end. Fire-and-forget — claimSlot runs
         *  inside the awaited hook, so it must not block on the emit —
         *  but the promise is retained so fill() can order the resolved
         *  label AFTER the placeholder in the durable chunk log. */
        const claimEmit = deps.emitLabelEvent(index, { ...part }).catch(() => undefined);
        let resolveFill: () => void = () => undefined;
        const fillDone = new Promise<void>((resolve) => {
          resolveFill = resolve;
        });
        deps.trackPendingFill(fillDone);
        return {
          index,
          context,
          fill: async (text) => {
            try {
              part.pending = false;
              if (text == null || text.length === 0) {
                return;
              }
              part[ContentTypes.ACTIVITY_LABEL] = text;
              await claimEmit;
              await deps.emitLabelEvent(index, part);
            } finally {
              resolveFill();
            }
          },
        };
      },
    }),
  };
}
