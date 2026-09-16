import { ContentTypes } from 'librechat-data-provider';
import type { TMessage, TMessageContentParts } from 'librechat-data-provider';
import type { TraceModel } from './model';

const PREVIEW_LENGTH = 160;
const ELLIPSIS = '…';

type ToolCallPreview = { name: string; args: string };

/** What one model call of a response produced: the text it wrote and the tools it called. */
export type StepPreview = { text: string; toolCalls: ToolCallPreview[] };

/**
 * A response's previews by model call. `finalOnly` marks a message that kept
 * only its final text (stored as flat text, or with intermediate output
 * filtered out), which belongs to the last model call, not the first.
 */
export type MessagePreview = {
  steps: StepPreview[];
  finalOnly: boolean;
  /** Agents ran in parallel lanes, whose output cannot be told apart by order. */
  parallel: boolean;
};

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

/** The run step a persisted tool call belongs to; parallel calls of one round share it. */
function runStepOf(call: ToolCallPart | undefined): string | undefined {
  return call != null && 'stepId' in call && typeof call.stepId === 'string'
    ? call.stepId
    : undefined;
}

/**
 * Splits a response's content into what each model call produced. A model call
 * may reason, write text and request tools, in that order, so a new call begins
 * where a tool call is followed by reasoning or text, or by a tool call from
 * another run step (consecutive tool-only calls). Parallel calls share a step.
 */
export function buildMessagePreview(message: TMessage | undefined): MessagePreview {
  const parts: TMessageContentParts[] = message?.content ?? [];
  const steps: StepPreview[] = [];
  let current: StepPreview | null = null;
  let afterToolCall = false;
  let lastRunStep: string | undefined;
  let roundAgent: string | undefined;
  let parallel = false;
  let sealed = false;
  const begin = () => {
    current = { text: '', toolCalls: [] };
    steps.push(current);
    afterToolCall = false;
    sealed = false;
    return current;
  };
  /** A handoff: output from another agent is that agent's own model call. */
  const handoff = (part: TMessageContentParts): boolean => {
    if (part.groupId != null) {
      parallel = true;
    }
    const agentId = part.agentId;
    const changed = agentId != null && roundAgent != null && agentId !== roundAgent;
    roundAgent = agentId ?? roundAgent;
    return changed && current != null;
  };
  for (const part of parts) {
    /** A streaming message writes parts at provider indexes, so the array can hold holes. */
    if (part == null) {
      continue;
    }
    if (part.type === ContentTypes.TOOL_CALL) {
      const runStep = runStepOf(part.tool_call);
      const handedOff = handoff(part);
      const nextRound =
        handedOff ||
        (afterToolCall && runStep != null && lastRunStep != null && runStep !== lastRunStep);
      const step = current == null || sealed || nextRound ? begin() : current;
      const call = callOf(part.tool_call);
      if (call != null) {
        step.toolCalls.push(call);
      }
      afterToolCall = true;
      lastRunStep = runStep ?? lastRunStep;
      continue;
    }
    if (part.type === ContentTypes.THINK) {
      if (afterToolCall) {
        begin();
      }
      continue;
    }
    /** Compaction is a model call of its own; its round previews nothing, but it holds its place. */
    if (part.type === ContentTypes.SUMMARY) {
      begin();
      sealed = true;
      continue;
    }
    if (part.type !== ContentTypes.TEXT) {
      continue;
    }
    const handedOff = handoff(part);
    const step = current == null || sealed || afterToolCall || handedOff ? begin() : current;
    step.text = compact(`${step.text} ${textOf(part.text)}`);
  }
  /** A failed turn's row stores the failure as its text; the model never wrote it. */
  if (steps.length === 0 && message?.text && message.error !== true) {
    return { steps: [{ text: compact(message.text), toolCalls: [] }], finalOnly: true, parallel };
  }
  const finalOnly = steps.length === 1 && steps[0].toolCalls.length === 0 && steps[0].text !== '';
  return { steps, finalOnly, parallel };
}

export function buildStepPreviews(message: TMessage | undefined): StepPreview[] {
  return buildMessagePreview(message).steps;
}

/**
 * The one-line preview each ledger row shows beside its record's name, taken
 * from the chat's own message rather than from the tracing backend: the text a
 * model call wrote, or the arguments a tool was called with. Built once per
 * model in one pass over every step, so search and rendering never rescan a
 * step per row. Only a step's own roots have a preview: the message describes
 * the response's calls, not what ran inside a tool (a subagent's model calls, a
 * tool's nested calls). Tool records are matched to the message's tool calls by
 * name, in the order they ran within their step; same-name calls that started in
 * the same millisecond have no reliable order and get none. The turn a page
 * boundary splits (`partialMessageId`) gets none until its earlier steps load.
 */
export function buildPreviewIndex(
  model: TraceModel,
  previewsByMessage: ReadonlyMap<string, MessagePreview>,
  partialMessageId?: string,
): Map<string, string> {
  const index = new Map<string, string>();
  const stepsByTurn = new Map(model.turns.map((turn) => [turn.messageId, turn.steps]));
  for (const step of model.steps.values()) {
    const message = previewsByMessage.get(step.messageId);
    if (
      message == null ||
      message.parallel ||
      step.origin === 'title' ||
      step.messageId === partialMessageId
    ) {
      continue;
    }
    if (message.finalOnly) {
      const text = message.steps[0]?.text;
      if (step.index === stepsByTurn.get(step.messageId) && step.generationId != null && text) {
        index.set(step.generationId, text);
      }
      continue;
    }
    const round = message.steps[step.index - 1];
    if (!round) {
      continue;
    }
    const callsByName = new Map<string, string[]>();
    for (const call of round.toolCalls) {
      callsByName.set(call.name, [...(callsByName.get(call.name) ?? []), call.args]);
    }
    const startsByName = new Map<string, Map<number, number>>();
    const roots = step.rootIds.flatMap((id) => {
      const node = model.nodes.get(id);
      return node != null ? [node] : [];
    });
    for (const node of roots) {
      if (node.record.kind !== 'tool') {
        continue;
      }
      const starts = startsByName.get(node.record.name) ?? new Map<number, number>();
      starts.set(node.start, (starts.get(node.start) ?? 0) + 1);
      startsByName.set(node.record.name, starts);
    }
    const ordinals = new Map<string, number>();
    for (const node of roots) {
      const { record } = node;
      if (record.kind === 'generation') {
        if (round.text) {
          index.set(record.id, round.text);
        }
        continue;
      }
      if (record.kind !== 'tool') {
        continue;
      }
      const ordinal = ordinals.get(record.name) ?? 0;
      ordinals.set(record.name, ordinal + 1);
      const ambiguous = (startsByName.get(record.name)?.get(node.start) ?? 0) > 1;
      const args = callsByName.get(record.name)?.[ordinal];
      if (!ambiguous && args) {
        index.set(record.id, args);
      }
    }
  }
  return index;
}

/** Previews for every response in a conversation, keyed by its message id. */
export function buildPreviews(
  messages: readonly TMessage[] | undefined,
): Map<string, MessagePreview> {
  const previews = new Map<string, MessagePreview>();
  for (const message of messages ?? []) {
    if (message.isCreatedByUser) {
      continue;
    }
    previews.set(message.messageId, buildMessagePreview(message));
  }
  return previews;
}
