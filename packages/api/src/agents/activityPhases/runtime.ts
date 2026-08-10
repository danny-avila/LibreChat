import { GraphEvents } from '@librechat/agents';
import { ContentTypes, StepTypes } from 'librechat-data-provider';
import type { EventHandler, HookCallback, HookInputByEvent } from '@librechat/agents';
import type { LooseContentPart } from '~/agents/activityLabels/wiring';
import { stringifyActivityEvidence } from '~/agents/activityLabels/runtime';

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
  status?: 'success' | 'partial' | 'error';
}

type TrackedActivity = ActivityPhaseEntry & {
  startIndex: number;
  childLabelIndex?: number;
  /** Stable anchors survive content filtering and prepends across HITL resume. */
  toolCallIds?: string[];
};

export interface ActivityPhaseSnapshot {
  version: 1;
  generated: number;
  activityCount: number;
  failedActivityCount: number;
  partialActivityCount: number;
  agentIds: string[];
  activities: TrackedActivity[];
  assistantContext: string[];
  pendingReasoning: Array<{
    key: string;
    text: string;
    agentId?: string;
    startIndex?: number;
  }>;
}

export interface GenerateActivityPhasePayload {
  activities: ActivityPhaseEntry[];
  assistantContext?: string[];
  closingTextPhase?: AssistantTextPhase;
  phaseIndex: number;
  totalActivityCount: number;
  status: 'completed' | 'partial' | 'failed';
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
  initialSnapshot?: ActivityPhaseSnapshot;
  getContentParts: () => Array<LooseContentPart | null | undefined>;
  getStepIndex?: (stepId: string) => number | undefined;
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
  /** Bounded state needed to continue the same phase after a HITL pause. */
  snapshot: () => ActivityPhaseSnapshot;
}

const DEFAULT_MAX_PER_RUN = 5;
const DEFAULT_CHAR_LIMIT = 600;
const MIN_ACTIVITIES = 2;
const MAX_CONTEXT_ITEMS = 6;
const MAX_EXCERPT_CHARS = 600;
const OUTPUT_CHAR_LIMIT = 160;
const PHASE_TIMEOUT_MS = 12_000;
/** Twelve enter the SDK prompt; one extra preserves its omitted-activity row. */
const MAX_RETAINED_ACTIVITIES = 13;
const MAX_RETAINED_TOOL_ENTRIES = 6;

export const ACTIVITY_PHASE_INSTRUCTION = `Summarize what this phase of an agent run accomplished. The result appears as the header of one collapsed parent group containing several activities.

Rules:
- One line, 8 to 18 words, past tense
- Lead with the concrete outcome and name the most distinctive subject
- Synthesize the phase; do not enumerate, count, or restate individual activities
- Describe failures plainly when they are the phase's material outcome
- Never mention tool names, calls, arguments, reasoning, commentary, or activity counts
- Output only the summary — no quotes, no trailing punctuation, no preamble

Examples:
- Reconciled authentication behavior and fixed the failing session refresh path
- Compared deployment options and documented the safest production rollout
- Investigated database latency but could not confirm the suspected index regression

Bad examples:
- Used three tools to inspect files and run tests
- Searched code, read configuration, and updated middleware`;

interface DeltaPart {
  text?: unknown;
  think?: unknown;
}

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
  return parts.map((part) => textValue((part as DeltaPart | null)?.[key])).join('');
}

function buildSignal(signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(PHASE_TIMEOUT_MS);
  return signal != null && typeof AbortSignal.any === 'function'
    ? AbortSignal.any([signal, timeout])
    : timeout;
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

function findTrackedStart(
  parts: ReadonlyArray<LooseContentPart | null | undefined>,
  activity: TrackedActivity,
): number {
  if (activity.toolCallIds != null && activity.toolCallIds.length > 0) {
    const toolStart = findBatchStart(parts, new Set(activity.toolCallIds));
    if (
      parts[toolStart]?.type === ContentTypes.TOOL_CALL &&
      activity.toolCallIds.includes(String(parts[toolStart]?.tool_call?.id ?? ''))
    ) {
      return toolStart;
    }
  }
  const excerpt = activity.thinkingExcerpts?.[0]?.trim();
  if (excerpt) {
    const needle = excerpt.slice(0, 80);
    for (let i = 0; i < parts.length; i++) {
      if (parts[i]?.type === ContentTypes.THINK && textValue(parts[i]?.think).includes(needle)) {
        return i;
      }
    }
  }
  return Math.min(activity.startIndex, Math.max(0, parts.length - 1));
}

function findReasoningStart(
  parts: ReadonlyArray<LooseContentPart | null | undefined>,
  text: string,
  startIndex?: number,
): number {
  const needle = text.trim().slice(0, 80);
  const matches = (part: LooseContentPart | null | undefined) =>
    part?.type === ContentTypes.THINK && textValue(part.think).includes(needle);
  if (startIndex != null && matches(parts[startIndex])) {
    return startIndex;
  }
  for (let index = 0; index < parts.length; index += 1) {
    if (matches(parts[index])) {
      return index;
    }
  }
  return startIndex ?? findLastPartIndex(parts, ContentTypes.THINK);
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
  const initialSnapshot = deps.initialSnapshot?.version === 1 ? deps.initialSnapshot : undefined;
  let generated = Math.max(
    initialSnapshot?.generated ?? 0,
    content.filter(
      (part) => part?.type === ContentTypes.ACTIVITY_LABEL && part.activity_label_type === 'phase',
    ).length,
  );
  let activities: TrackedActivity[] =
    initialSnapshot?.activities.map((activity) => ({
      ...activity,
      startIndex: findTrackedStart(content, activity),
    })) ?? [];
  let activityCount = initialSnapshot?.activityCount ?? activities.length;
  let failedActivityCount =
    initialSnapshot?.failedActivityCount ??
    activities.filter((activity) => activity.status === 'error').length;
  let partialActivityCount =
    initialSnapshot?.partialActivityCount ??
    activities.filter((activity) => activity.status === 'partial').length;
  const contributingAgentIds = new Set(initialSnapshot?.agentIds ?? []);
  let assistantContext = (initialSnapshot?.assistantContext ?? []).slice(-MAX_CONTEXT_ITEMS);
  const pendingReasoning = new Map<string, { text: string; agentId?: string; startIndex?: number }>(
    (initialSnapshot?.pendingReasoning ?? []).map(({ key, text, agentId, startIndex }) => [
      key,
      {
        text: text.slice(-MAX_EXCERPT_CHARS),
        ...(agentId != null && { agentId }),
        ...(startIndex != null && { startIndex }),
      },
    ]),
  );
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
    activityCount = 0;
    failedActivityCount = 0;
    partialActivityCount = 0;
    contributingAgentIds.clear();
  };

  const trackActivity = (activity: TrackedActivity) => {
    activityCount += 1;
    if (activity.status === 'error') {
      failedActivityCount += 1;
    } else if (activity.status === 'partial') {
      partialActivityCount += 1;
    }
    if (activity.agentId != null) {
      contributingAgentIds.add(activity.agentId);
    }
    if (activities.length < MAX_RETAINED_ACTIVITIES) {
      activities.push(activity);
    }
  };

  const snapshot = (): ActivityPhaseSnapshot => ({
    version: 1,
    generated,
    activityCount,
    failedActivityCount,
    partialActivityCount,
    agentIds: [...contributingAgentIds],
    activities: activities.map((activity) => ({
      ...activity,
      ...(activity.entries != null && {
        entries: activity.entries.slice(0, MAX_RETAINED_TOOL_ENTRIES).map((entry) => ({
          ...entry,
          toolInput: stringifyActivityEvidence(entry.toolInput, charLimit),
          ...(entry.toolOutput != null && {
            toolOutput: stringifyActivityEvidence(entry.toolOutput, charLimit),
          }),
          ...(entry.error != null && { error: entry.error.slice(0, charLimit) }),
        })),
      }),
      ...(activity.thinkingExcerpts != null && {
        thinkingExcerpts: activity.thinkingExcerpts.map((text) => text.slice(-MAX_EXCERPT_CHARS)),
      }),
    })),
    assistantContext: assistantContext.slice(-MAX_CONTEXT_ITEMS),
    pendingReasoning: [...pendingReasoning].map(([key, reasoning]) => ({
      key,
      text: reasoning.text.slice(-MAX_EXCERPT_CHARS),
      ...(reasoning.agentId != null && { agentId: reasoning.agentId }),
      ...(reasoning.startIndex != null && { startIndex: reasoning.startIndex }),
    })),
  });

  const addPendingReasoning = (onlyKey?: string) => {
    let selected = [...pendingReasoning.entries()] as Array<
      readonly [string, { text: string; agentId?: string; startIndex?: number }]
    >;
    if (onlyKey != null) {
      const reasoning = pendingReasoning.get(onlyKey);
      selected = reasoning == null ? [] : [[onlyKey, reasoning] as const];
    }
    for (const [key, reasoning] of selected) {
      const text = reasoning.text.trim();
      if (text) {
        const parts = deps.getContentParts();
        trackActivity({
          thinkingExcerpts: [text.slice(0, MAX_EXCERPT_CHARS)],
          ...(reasoning.agentId != null && { agentId: reasoning.agentId }),
          status: 'success',
          startIndex: findReasoningStart(parts, text, reasoning.startIndex),
        });
      }
      pendingReasoning.delete(key);
    }
  };

  const resolveActivities = (snapshot: TrackedActivity[]): ActivityPhaseEntry[] => {
    const parts = deps.getContentParts();
    return snapshot.map(
      ({ childLabelIndex, toolCallIds, startIndex: _startIndex, ...activity }) => {
        const matchesToolIds = (part: LooseContentPart | null | undefined): boolean => {
          if (part?.type !== ContentTypes.ACTIVITY_LABEL || part.activity_label_type === 'phase') {
            return false;
          }
          if (toolCallIds == null || toolCallIds.length === 0) {
            return true;
          }
          const childIds = Array.isArray(part.tool_call_ids) ? part.tool_call_ids : [];
          return childIds.some((id) => typeof id === 'string' && toolCallIds.includes(id));
        };
        let child = childLabelIndex == null ? undefined : parts[childLabelIndex];
        if (!matchesToolIds(child) && toolCallIds != null && toolCallIds.length > 0) {
          child = parts.find(matchesToolIds);
        }
        if (!matchesToolIds(child)) {
          return activity;
        }
        const label =
          child?.pending !== true ? textValue(child?.[ContentTypes.ACTIVITY_LABEL]).trim() : '';
        return label ? { ...activity, label, entries: undefined } : activity;
      },
    );
  };

  const close = (closingTextPhase?: AssistantTextPhase, hardBoundary = false) => {
    addPendingReasoning();
    if (generated >= maxPerRun) {
      clear();
      return;
    }
    if (activityCount < MIN_ACTIVITIES) {
      if (hardBoundary) clear();
      return;
    }

    generated += 1;
    const phaseIndex = generated - 1;
    const snapshot = [...activities];
    const contextSnapshot = [...assistantContext];
    const totalActivityCount = activityCount;
    const failedCount = failedActivityCount;
    const partialCount = partialActivityCount;
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
    const agentIds = [...contributingAgentIds];
    let phaseStatus: 'ok' | 'partial' | 'failed' = 'ok';
    if (failedCount === totalActivityCount) {
      phaseStatus = 'failed';
    } else if (failedCount > 0 || partialCount > 0) {
      phaseStatus = 'partial';
    }
    const index = deps.getContentParts().length;
    const part: LooseContentPart = {
      type: ContentTypes.ACTIVITY_LABEL,
      [ContentTypes.ACTIVITY_LABEL]: '',
      activity_label_type: 'phase',
      activity_start_index: startIndex,
      activity_count: totalActivityCount,
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
          totalActivityCount,
          status: phaseStatus === 'ok' ? 'completed' : phaseStatus,
          agentIds,
          charLimit,
          prompt: deps.prompt ?? ACTIVITY_PHASE_INSTRUCTION,
          signal: buildSignal(deps.abortSignal),
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
      } catch {
        // A failed durable fill leaves the pending marker invisible and unbilled.
        return;
      }
      try {
        if (generatedPhase.collectUsage != null) {
          await generatedPhase.collectUsage(label || undefined);
        }
      } catch {
        // The committed UI projection must not regress when accounting fails.
      }
    })();
    deps.trackPendingFill(task);
  };

  const hook: HookCallback<'PostToolBatch'> = async (input: PostToolBatchInput) => {
    if (input.agentId != null || input.entries.length === 0 || deps.abortSignal?.aborted) {
      return {};
    }
    /** A top-level handoff is intentionally one logical phase activity. The
     *  child-label hook skips it because a transfer card cannot join a tool
     *  group; the parent phase can contain that card and should summarize the
     *  material agent transition. `input.agentId` above still excludes nested
     *  subagent internals. */
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
    let activityStatus: TrackedActivity['status'] = 'success';
    if (failures === entries.length) {
      activityStatus = 'error';
    } else if (failures > 0) {
      activityStatus = 'partial';
    }
    trackActivity({
      entries,
      ...(reasoning ? { thinkingExcerpts: [reasoning.slice(0, MAX_EXCERPT_CHARS)] } : {}),
      ...(input.executingAgentId != null && { agentId: input.executingAgentId }),
      status: activityStatus,
      startIndex: findBatchStart(parts, ids),
      toolCallIds: [...ids],
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
            groupId?: string | number;
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
              const result = runStepHandler.handle(event, data, metadata, graph);
              if (!pendingReasoning.has(reasoningKey)) {
                const startIndex = deps.getStepIndex?.(step.id);
                pendingReasoning.set(reasoningKey, {
                  text: '',
                  ...(step.agentId != null && { agentId: step.agentId }),
                  ...(startIndex != null && { startIndex }),
                });
              }
              return result;
            } else {
              if (phase === 'final_answer' && step.groupId == null) {
                addPendingReasoning(step.agentId ?? 'root');
                stepKinds.set(step.id, { kind, phase, captureContext: false });
                close(phase, true);
              } else {
                if (phase == null && step.groupId == null) {
                  addPendingReasoning(step.agentId ?? 'root');
                }
                const closesPhase =
                  phase == null && step.groupId == null && activityCount >= MIN_ACTIVITIES;
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

  return { hook, handlers: wrapHandlers, drop: clear, snapshot };
}
