import { ContentTypes } from 'librechat-data-provider';
import type { TMessage, TMessageContentParts } from 'librechat-data-provider';
import type { TraceModel, TraceNode } from './model';

const PREVIEW_LENGTH = 160;
const ELLIPSIS = '…';

type ToolCallPreview = { name: string; args: string };

/** What one model call of a response produced: the text it wrote and the tools it called. */
export type StepPreview = { text: string; toolCalls: ToolCallPreview[] };

/**
 * A response's previews by model call. `fromText` marks a message stored with
 * only its final text, which belongs to the last model call, not the first.
 */
export type MessagePreview = { steps: StepPreview[]; fromText: boolean };

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
  const begin = () => {
    current = { text: '', toolCalls: [] };
    steps.push(current);
    afterToolCall = false;
    return current;
  };
  for (const part of parts) {
    if (part.type === ContentTypes.TOOL_CALL) {
      const runStep = runStepOf(part.tool_call);
      const nextRound =
        afterToolCall && runStep != null && lastRunStep != null && runStep !== lastRunStep;
      const step = current == null || nextRound ? begin() : current;
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
    if (part.type !== ContentTypes.TEXT) {
      continue;
    }
    const step = current == null || afterToolCall ? begin() : current;
    step.text = compact(`${step.text} ${textOf(part.text)}`);
  }
  /** A failed turn's row stores the failure as its text; the model never wrote it. */
  if (steps.length === 0 && message?.text && message.error !== true) {
    return { steps: [{ text: compact(message.text), toolCalls: [] }], fromText: true };
  }
  return { steps, fromText: false };
}

export function buildStepPreviews(message: TMessage | undefined): StepPreview[] {
  return buildMessagePreview(message).steps;
}

/**
 * The one-line preview a ledger row shows beside a record's name, taken from the
 * chat's own message rather than from the tracing backend: the text a model call
 * wrote, or the arguments a tool was called with. Only a step's own roots have
 * one: the message describes the response's calls, not what ran inside a tool
 * (a subagent's model calls, a tool's nested calls). Tool records are matched
 * to the message's tool calls by name, in the order they ran within their step.
 */
export function previewFor(
  node: TraceNode,
  model: TraceModel,
  previewsByMessage: ReadonlyMap<string, MessagePreview>,
): string | undefined {
  const { record } = node;
  if (record.origin === 'title' || (record.kind !== 'generation' && record.kind !== 'tool')) {
    return undefined;
  }
  const message = previewsByMessage.get(record.messageId);
  const step = node.stepKey != null ? model.steps.get(node.stepKey) : undefined;
  if (message == null || step == null || step.origin === 'title') {
    return undefined;
  }
  if (!step.rootIds.includes(record.id)) {
    return undefined;
  }
  if (message.fromText) {
    const turn = model.turns.find((candidate) => candidate.messageId === record.messageId);
    const last = record.kind === 'generation' && turn != null && step.index === turn.steps;
    return last ? message.steps[0]?.text || undefined : undefined;
  }
  const preview = message.steps[step.index - 1];
  if (!preview) {
    return undefined;
  }
  if (record.kind === 'generation') {
    return preview.text || undefined;
  }
  /** Same-name calls that started in the same millisecond have no reliable order to match by. */
  const ambiguous = step.rootIds.some((id) => {
    const other = model.nodes.get(id);
    return (
      other != null &&
      other !== node &&
      other.record.kind === 'tool' &&
      other.record.name === record.name &&
      other.start === node.start
    );
  });
  if (ambiguous) {
    return undefined;
  }
  const ordinal = toolOrdinal(node, model, step.rootIds);
  const match = preview.toolCalls.filter((call) => call.name === record.name)[ordinal];
  return match?.args || undefined;
}

/** How many earlier root tool records of the same name the step holds. */
function toolOrdinal(node: TraceNode, model: TraceModel, rootIds: string[]): number {
  let ordinal = 0;
  for (const id of rootIds) {
    const current = model.nodes.get(id);
    if (current === node) {
      break;
    }
    if (current?.record.kind === 'tool' && current.record.name === node.record.name) {
      ordinal++;
    }
  }
  return ordinal;
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
