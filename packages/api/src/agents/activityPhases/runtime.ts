import { GraphEvents } from '@librechat/agents';
import { ContentTypes, StepTypes } from 'librechat-data-provider';
import type { EventHandler, HookCallback, HookInputByEvent } from '@librechat/agents';
import type { LooseContentPart } from '~/agents/activityLabels/wiring';

type PostToolBatchInput = HookInputByEvent['PostToolBatch'];
type BatchEntry = PostToolBatchInput['entries'][number];

export type AssistantTextPhase = 'commentary' | 'final_answer';

export interface ActivityPhaseEntry {
  label?: string;
  entries?: Array<{
    toolName: string;
    toolInput: unknown;
    toolOutput?: unknown;
    error?: string;
    status: 'success' | 'error';
  }>;
  thinkingExcerpts?: string[];
  agentId?: string;
  status?: 'success' | 'error';
}

export interface GenerateActivityPhasePayload {
  activities: ActivityPhaseEntry[];
  assistantContext?: string[];
  closingTextPhase?: AssistantTextPhase;
  phaseIndex: number;
  status: 'completed' | 'failed';
  agentIds: string[];
  charLimit: number;
  prompt?: string;
  signal: AbortSignal;
}

export interface GeneratedActivityPhase {
  label?: string;
  collectUsage?: (label?: string) => void | Promise<void>;
}

export interface ActivityPhaseHostDeps {
  maxPerRun?: number;
  charLimit?: number;
  prompt?: string;
  abortSignal?: AbortSignal;
  getContentParts: () => Array<LooseContentPart | null | undefined>;
  bumpIndexOffset: () => void;
  emitLabelEvent: (index: number, part: LooseContentPart) => Promise<unknown>;
  trackPendingFill: (fillDone: Promise<void>) => void;
  isClosed?: () => boolean;
  generatePhase: (payload: GenerateActivityPhasePayload) => Promise<GeneratedActivityPhase>;
}

export interface ActivityPhaseWiring {
  hook: HookCallback<'PostToolBatch'>;
  handlers: (
    handlers: Record<string, EventHandler> | undefined,
  ) => Record<string, EventHandler> | undefined;
  /** A steer is a hard semantic boundary; incomplete evidence is discarded. */
  drop: () => void;
}

type TrackedActivity = ActivityPhaseEntry & {
  startIndex: number;
  childLabelIndex?: number;
};

const DEFAULT_MAX_PER_RUN = 5;
const DEFAULT_CHAR_LIMIT = 600;
const MIN_ACTIVITIES = 2;
const MAX_CONTEXT_ITEMS = 6;
const MAX_EXCERPT_CHARS = 600;
const OUTPUT_CHAR_LIMIT = 160;

function textValue(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  const nested = (value as { value?: unknown } | null | undefined)?.value;
  return typeof nested === 'string' ? nested : '';
}

function normalizeLabel(value: string | undefined): string {
  const firstLine = value?.split(/\r?\n/).find((line) => line.trim().length > 0) ?? '';
  const normalized = firstLine.replace(/\s+/g, ' ').trim();
  return normalized.length > OUTPUT_CHAR_LIMIT
    ? `${normalized.slice(0, OUTPUT_CHAR_LIMIT - 1)}…`
    : normalized;
}

function deltaText(data: unknown, key: 'text' | 'think'): string {
  const raw = (data as { delta?: { content?: unknown } } | null)?.delta?.content;
  let parts: unknown[] = [];
  if (Array.isArray(raw)) {
    parts = raw;
  } else if (raw != null) {
    parts = [raw];
  }
  return parts.map((part) => textValue((part as Record<string, unknown> | null)?.[key])).join('');
}

function findLastPartIndex(
  parts: ReadonlyArray<LooseContentPart | null | undefined>,
  type: string,
): number {
  for (let i = parts.length - 1; i >= 0; i--) {
    if (parts[i]?.type === type) {
      return i;
    }
  }
  return Math.max(0, parts.length - 1);
}

function findBatchStart(
  parts: ReadonlyArray<LooseContentPart | null | undefined>,
  toolCallIds: Set<string>,
): number {
  let first = -1;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (
      part?.type === ContentTypes.TOOL_CALL &&
      typeof part.tool_call?.id === 'string' &&
      toolCallIds.has(part.tool_call.id)
    ) {
      first = first < 0 ? i : Math.min(first, i);
    }
  }
  return first >= 0 ? first : Math.max(0, parts.length - 1);
}

/** Persists Open Responses text-phase metadata onto LibreChat text parts.
 *  Installed for existing batch labels too, so commentary can supply intent
 *  even when parent phase summaries are disabled. */
export function createAssistantPhaseStampingHandlers(
  handlers: Record<string, EventHandler> | undefined,
): Record<string, EventHandler> | undefined {
  if (handlers == null) {
    return handlers;
  }
  const phases = new Map<string, AssistantTextPhase>();
  const wrapped = { ...handlers };
  const runStepHandler = handlers[GraphEvents.ON_RUN_STEP];
  if (runStepHandler != null) {
    wrapped[GraphEvents.ON_RUN_STEP] = {
      handle: (event, data, metadata, graph) => {
        const step = data as {
          id?: string;
          stepDetails?: { message_creation?: { phase?: string } };
        };
        const phase = step.stepDetails?.message_creation?.phase;
        if (step.id && (phase === 'commentary' || phase === 'final_answer')) {
          phases.set(step.id, phase);
        }
        return runStepHandler.handle(event, data, metadata, graph);
      },
    };
  }
  const messageHandler = handlers[GraphEvents.ON_MESSAGE_DELTA];
  if (messageHandler != null) {
    wrapped[GraphEvents.ON_MESSAGE_DELTA] = {
      handle: (event, data, metadata, graph) => {
        const phase = phases.get((data as { id?: string }).id ?? '');
        const delta = (data as { delta?: { content?: unknown } }).delta;
        const raw = delta?.content;
        if (phase == null || raw == null) {
          return messageHandler.handle(event, data, metadata, graph);
        }
        const stamp = (part: unknown) =>
          (part as { type?: string } | null)?.type === ContentTypes.TEXT
            ? { ...(part as Record<string, unknown>), phase }
            : part;
        const forwarded = {
          ...(data as Record<string, unknown>),
          delta: {
            ...delta,
            content: Array.isArray(raw) ? raw.map(stamp) : stamp(raw),
          },
        };
        return messageHandler.handle(event, forwarded, metadata, graph);
      },
    };
  }
  return wrapped;
}

/**
 * Collects run-wide logical activities and emits one parent summary at a text
 * boundary. The summary call is detached; the boundary only pays the cheap
 * synchronous slot claim needed to keep streamed content indices stable.
 */
export function createActivityPhaseWiring(deps: ActivityPhaseHostDeps): ActivityPhaseWiring {
  const maxPerRun = deps.maxPerRun ?? DEFAULT_MAX_PER_RUN;
  const charLimit = deps.charLimit ?? DEFAULT_CHAR_LIMIT;
  const content = deps.getContentParts();
  let generated = content.filter(
    (part) => part?.type === ContentTypes.ACTIVITY_LABEL && part.activity_label_type === 'phase',
  ).length;
  let activities: TrackedActivity[] = [];
  let assistantContext: string[] = [];
  const pendingReasoning = new Map<string, { text: string; agentId?: string }>();
  const reasoningStepKeys = new Map<string, string>();
  const stepKinds = new Map<
    string,
    { kind: 'text' | 'think'; phase?: AssistantTextPhase; captureContext?: boolean }
  >();

  const clear = () => {
    activities = [];
    assistantContext = [];
    pendingReasoning.clear();
    reasoningStepKeys.clear();
    stepKinds.clear();
  };

  const addPendingReasoning = (onlyKey?: string) => {
    let selected = [...pendingReasoning.entries()] as Array<
      readonly [string, { text: string; agentId?: string }]
    >;
    if (onlyKey != null) {
      const reasoning = pendingReasoning.get(onlyKey);
      selected = reasoning == null ? [] : [[onlyKey, reasoning] as const];
    }
    for (const [key, reasoning] of selected) {
      const text = reasoning.text.trim();
      if (text) {
        const parts = deps.getContentParts();
        activities.push({
          thinkingExcerpts: [text.slice(0, MAX_EXCERPT_CHARS)],
          ...(reasoning.agentId != null && { agentId: reasoning.agentId }),
          status: 'success',
          startIndex: findLastPartIndex(parts, ContentTypes.THINK),
        });
      }
      pendingReasoning.delete(key);
    }
  };

  const resolveActivities = (snapshot: TrackedActivity[]): ActivityPhaseEntry[] => {
    const parts = deps.getContentParts();
    return snapshot.map(({ childLabelIndex, startIndex: _startIndex, ...activity }) => {
      if (childLabelIndex == null) {
        return activity;
      }
      const child = parts[childLabelIndex];
      const label =
        child?.type === ContentTypes.ACTIVITY_LABEL &&
        child.activity_label_type !== 'phase' &&
        child.pending !== true
          ? textValue(child[ContentTypes.ACTIVITY_LABEL]).trim()
          : '';
      return label ? { ...activity, label, entries: undefined } : activity;
    });
  };

  const close = (closingTextPhase?: AssistantTextPhase, hardBoundary = false) => {
    addPendingReasoning();
    if (generated >= maxPerRun) {
      clear();
      return;
    }
    if (activities.length < MIN_ACTIVITIES) {
      if (hardBoundary) clear();
      return;
    }

    generated += 1;
    const phaseIndex = generated - 1;
    const snapshot = [...activities];
    const contextSnapshot = [...assistantContext];
    let startIndex = Math.min(...snapshot.map((activity) => activity.startIndex));
    const currentParts = deps.getContentParts();
    /** Pull leading commentary/reasoning into the parent card. A prior phase
     *  marker or steer is the only hard UI boundary; plain text can be
     *  intermediate context on providers that do not expose phase metadata. */
    for (let i = startIndex - 1; i >= 0; i--) {
      const prior = currentParts[i];
      if (
        prior?.type === ContentTypes.STEER ||
        (prior?.type === ContentTypes.ACTIVITY_LABEL && prior.activity_label_type === 'phase') ||
        (prior?.type === ContentTypes.TEXT && prior.phase === 'final_answer')
      ) {
        break;
      }
      startIndex = i;
    }
    const agentIds = [
      ...new Set(snapshot.flatMap((activity) => (activity.agentId ? [activity.agentId] : []))),
    ];
    const failedCount = snapshot.filter((activity) => activity.status === 'error').length;
    let phaseStatus: 'ok' | 'partial' | 'failed' = 'ok';
    if (failedCount === snapshot.length) {
      phaseStatus = 'failed';
    } else if (failedCount > 0) {
      phaseStatus = 'partial';
    }
    const index = deps.getContentParts().length;
    const part: LooseContentPart = {
      type: ContentTypes.ACTIVITY_LABEL,
      [ContentTypes.ACTIVITY_LABEL]: '',
      activity_label_type: 'phase',
      activity_start_index: startIndex,
      activity_count: snapshot.length,
      ...(agentIds.length > 0 && { agent_ids: agentIds }),
      status: phaseStatus,
      pending: true,
    };
    deps.getContentParts().push(part);
    deps.bumpIndexOffset();
    void Promise.resolve(deps.emitLabelEvent(index, part)).catch(() => undefined);
    clear();

    const task = (async () => {
      let generatedPhase: GeneratedActivityPhase = {};
      try {
        generatedPhase = await deps.generatePhase({
          activities: resolveActivities(snapshot),
          ...(contextSnapshot.length > 0 && { assistantContext: contextSnapshot }),
          ...(closingTextPhase != null && { closingTextPhase }),
          phaseIndex,
          status: failedCount === snapshot.length ? 'failed' : 'completed',
          agentIds,
          charLimit,
          ...(deps.prompt != null && { prompt: deps.prompt }),
          signal: deps.abortSignal ?? new AbortController().signal,
        });
      } catch {
        generatedPhase = {};
      }
      if (deps.isClosed?.() === true) {
        return;
      }
      const label = normalizeLabel(generatedPhase.label);
      const next: LooseContentPart = {
        ...part,
        [ContentTypes.ACTIVITY_LABEL]: label,
        pending: false,
      };
      try {
        await deps.emitLabelEvent(index, next);
        Object.assign(part, next);
        if (label && generatedPhase.collectUsage != null) {
          await generatedPhase.collectUsage(label);
        }
      } catch {
        // A failed durable fill leaves the pending marker invisible and unbilled.
      }
    })();
    deps.trackPendingFill(task);
  };

  const hook: HookCallback<'PostToolBatch'> = async (input: PostToolBatchInput) => {
    if (input.agentId != null || input.entries.length === 0 || deps.abortSignal?.aborted) {
      return {};
    }
    const reasoningKey = input.executingAgentId ?? 'root';
    const reasoning = pendingReasoning.get(reasoningKey)?.text.trim();
    const ids = new Set(input.entries.map((entry) => entry.toolUseId));
    const parts = deps.getContentParts();
    let childLabelIndex: number | undefined;
    for (let i = parts.length - 1; i >= 0; i--) {
      const part = parts[i];
      if (part?.type !== ContentTypes.ACTIVITY_LABEL || part.activity_label_type === 'phase') {
        continue;
      }
      const childIds = Array.isArray(part.tool_call_ids) ? part.tool_call_ids : [];
      if (childIds.some((id) => typeof id === 'string' && ids.has(id))) {
        childLabelIndex = i;
        break;
      }
    }
    const entries = input.entries.map((entry: BatchEntry) => ({
      toolName: entry.toolName,
      toolInput: entry.toolInput,
      toolOutput: entry.toolOutput,
      error: entry.error,
      status: entry.status,
    }));
    const failures = entries.filter((entry) => entry.status === 'error').length;
    activities.push({
      entries,
      ...(reasoning ? { thinkingExcerpts: [reasoning.slice(0, MAX_EXCERPT_CHARS)] } : {}),
      ...(input.executingAgentId != null && { agentId: input.executingAgentId }),
      status: failures === entries.length ? 'error' : 'success',
      startIndex: findBatchStart(parts, ids),
      ...(childLabelIndex != null && { childLabelIndex }),
    });
    pendingReasoning.delete(reasoningKey);
    return {};
  };

  const wrapHandlers = (
    handlers: Record<string, EventHandler> | undefined,
  ): Record<string, EventHandler> | undefined => {
    if (handlers == null) {
      return handlers;
    }
    const phaseHandlers = createAssistantPhaseStampingHandlers(handlers) ?? handlers;
    const wrapped = { ...phaseHandlers };
    const runStepHandler = phaseHandlers[GraphEvents.ON_RUN_STEP];
    if (runStepHandler != null) {
      wrapped[GraphEvents.ON_RUN_STEP] = {
        handle: (event, data, metadata, graph) => {
          const step = data as {
            id?: string;
            agentId?: string;
            stepDetails?: {
              type?: string;
              message_creation?: { content_type?: string; phase?: string };
            };
          };
          if (step.stepDetails?.type === StepTypes.MESSAGE_CREATION && step.id) {
            const creation = step.stepDetails.message_creation;
            const kind = creation?.content_type === 'think' ? 'think' : 'text';
            const phase =
              creation?.phase === 'commentary' || creation?.phase === 'final_answer'
                ? creation.phase
                : undefined;
            if (kind === 'think') {
              stepKinds.set(step.id, { kind });
              const reasoningKey = step.agentId ?? 'root';
              reasoningStepKeys.set(step.id, reasoningKey);
              if (!pendingReasoning.has(reasoningKey)) {
                pendingReasoning.set(reasoningKey, {
                  text: '',
                  ...(step.agentId != null && { agentId: step.agentId }),
                });
              }
            } else {
              addPendingReasoning();
              if (phase === 'final_answer') {
                stepKinds.set(step.id, { kind, phase, captureContext: false });
                close(phase, true);
              } else {
                const closesPhase = phase == null && activities.length >= MIN_ACTIVITIES;
                stepKinds.set(step.id, {
                  kind,
                  ...(phase != null && { phase }),
                  captureContext: !closesPhase,
                });
                if (closesPhase) {
                  close(undefined, false);
                } else {
                  assistantContext.push('');
                  if (assistantContext.length > MAX_CONTEXT_ITEMS) assistantContext.shift();
                }
              }
            }
          }
          return runStepHandler.handle(event, data, metadata, graph);
        },
      };
    }

    const messageHandler = phaseHandlers[GraphEvents.ON_MESSAGE_DELTA];
    if (messageHandler != null) {
      wrapped[GraphEvents.ON_MESSAGE_DELTA] = {
        handle: (event, data, metadata, graph) => {
          const id = (data as { id?: string }).id;
          const tracked = id ? stepKinds.get(id) : undefined;
          if (tracked?.kind === 'text' && tracked.captureContext === true) {
            const text = deltaText(data, 'text');
            if (text) {
              const last = assistantContext.length - 1;
              const next = `${last >= 0 ? assistantContext[last] : ''}${text}`.slice(
                -MAX_EXCERPT_CHARS,
              );
              if (last >= 0) assistantContext[last] = next;
              else assistantContext.push(next);
              if (assistantContext.length > MAX_CONTEXT_ITEMS) assistantContext.shift();
            }
          }
          return messageHandler.handle(event, data, metadata, graph);
        },
      };
    }

    const reasoningHandler = phaseHandlers[GraphEvents.ON_REASONING_DELTA];
    if (reasoningHandler != null) {
      wrapped[GraphEvents.ON_REASONING_DELTA] = {
        handle: (event, data, metadata, graph) => {
          const id = (data as { id?: string }).id;
          const reasoningKey = id ? reasoningStepKeys.get(id) : undefined;
          const reasoning = reasoningKey ? pendingReasoning.get(reasoningKey) : undefined;
          if (reasoning != null) {
            reasoning.text = `${reasoning.text}${deltaText(data, 'think')}`.slice(
              -MAX_EXCERPT_CHARS,
            );
          }
          return reasoningHandler.handle(event, data, metadata, graph);
        },
      };
    }
    return wrapped;
  };

  return { hook, handlers: wrapHandlers, drop: clear };
}
