import { GraphEvents } from '@librechat/agents';
import { ContentTypes, StepTypes } from 'librechat-data-provider';
import type { EventHandler, HookCallback, HookInputByEvent } from '@librechat/agents';
import type { LooseContentPart } from '~/agents/activityLabels/wiring';
import { stringifyActivityEvidence } from '~/agents/activityLabels/runtime';

type PostToolBatchInput = HookInputByEvent['PostToolBatch'];
type BatchEntry = PostToolBatchInput['entries'][number];
type AssistantContextEntry = { stepId?: string; text: string };

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
  /** Original boundary retained while only part of a saved tool batch is materialized. */
  unresolvedToolStartIndex?: number;
};

export interface ActivityPhaseSnapshot {
  version: 1;
  generated: number;
  activityCount: number;
  failedActivityCount: number;
  partialActivityCount: number;
  agentIds: string[];
  activities: TrackedActivity[];
  overflowActivityStartIndex?: number;
  overflowToolCallIds?: string[];
  /** IDs tied to the saved numeric overflow boundary, including equal-index batches. */
  overflowBoundaryToolCallIds?: string[];
  /** @deprecated Stable anchor retained for snapshots created before multi-anchor support. */
  overflowReasoningExcerpt?: string;
  /** Bounded stable anchors for reasoning-only overflow after HITL content compaction. */
  overflowReasoningAnchors?: string[];
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
  /** Finalizes unphased evidence once the root AgentRun has actually completed. */
  complete: () => void;
  /** Bounded state needed to continue the same phase after a HITL pause. */
  snapshot: () => ActivityPhaseSnapshot;
}

const DEFAULT_MAX_PER_RUN = 5;
const DEFAULT_CHAR_LIMIT = 600;
const MIN_ACTIVITIES = 2;
const MAX_CONTEXT_ITEMS = 6;
const MAX_EXCERPT_CHARS = 600;
const REASONING_ANCHOR_CHARS = 80;
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

function definedPartIndices(parts: ReadonlyArray<LooseContentPart | null | undefined>): number[] {
  return Object.keys(parts).map(Number);
}

function findLastPartIndex(
  parts: ReadonlyArray<LooseContentPart | null | undefined>,
  type: string,
): number {
  const indices = definedPartIndices(parts);
  for (let position = indices.length - 1; position >= 0; position -= 1) {
    const index = indices[position];
    if (parts[index]?.type === type) {
      return index;
    }
  }
  return Math.max(0, parts.length - 1);
}

function findBatchStart(
  parts: ReadonlyArray<LooseContentPart | null | undefined>,
  toolCallIds: Set<string>,
): number {
  let first = -1;
  for (const index of definedPartIndices(parts)) {
    const part = parts[index];
    if (
      part?.type === ContentTypes.TOOL_CALL &&
      typeof part.tool_call?.id === 'string' &&
      toolCallIds.has(part.tool_call.id)
    ) {
      first = first < 0 ? index : Math.min(first, index);
    }
  }
  return first >= 0 ? first : Math.max(0, parts.length - 1);
}

function findTrackedStart(
  parts: ReadonlyArray<LooseContentPart | null | undefined>,
  activity: TrackedActivity,
): number {
  const toolStart = findTrackedToolStart(parts, activity);
  if (toolStart != null) {
    return toolStart;
  }
  const excerpt = activity.thinkingExcerpts?.[0]?.trim();
  if (excerpt) {
    const reasoningStart = findReasoningExcerptStart(parts, excerpt);
    if (reasoningStart != null) {
      return reasoningStart;
    }
  }
  return Math.min(activity.startIndex, Math.max(0, parts.length - 1));
}

function findReasoningExcerptStart(
  parts: ReadonlyArray<LooseContentPart | null | undefined>,
  excerpt: string,
): number | undefined {
  const needle = excerpt.trim().slice(0, REASONING_ANCHOR_CHARS);
  if (!needle) {
    return undefined;
  }
  for (const index of definedPartIndices(parts)) {
    if (
      parts[index]?.type === ContentTypes.THINK &&
      textValue(parts[index]?.think).includes(needle)
    ) {
      return index;
    }
  }
  return undefined;
}

function hasReasoningExcerptAtOrAfter(
  parts: ReadonlyArray<LooseContentPart | null | undefined>,
  excerpt: string,
  minimumIndex: number,
): boolean {
  const needle = excerpt.trim().slice(0, REASONING_ANCHOR_CHARS);
  if (!needle) {
    return false;
  }
  const indices = definedPartIndices(parts);
  for (let position = indices.length - 1; position >= 0; position -= 1) {
    const index = indices[position];
    if (index < minimumIndex) {
      break;
    }
    if (
      parts[index]?.type === ContentTypes.THINK &&
      textValue(parts[index]?.think).includes(needle)
    ) {
      return true;
    }
  }
  return false;
}

type ReasoningAnchorIndex = Map<number, Set<string>>;

function addReasoningAnchor(
  anchors: Set<string>,
  index: ReasoningAnchorIndex,
  excerpt: string,
): void {
  const anchor = excerpt.trim().slice(0, REASONING_ANCHOR_CHARS);
  if (!anchor || anchors.has(anchor)) {
    return;
  }
  anchors.add(anchor);
  const matchingLength = index.get(anchor.length);
  if (matchingLength != null) {
    matchingLength.add(anchor);
  } else {
    index.set(anchor.length, new Set([anchor]));
  }
}

function includesReasoningAnchor(text: string, index: ReasoningAnchorIndex): boolean {
  for (const [length, anchors] of index) {
    for (let offset = 0; offset <= text.length - length; offset += 1) {
      if (anchors.has(text.slice(offset, offset + length))) {
        return true;
      }
    }
  }
  return false;
}

function hasIndexedReasoningAtOrAfter(
  parts: ReadonlyArray<LooseContentPart | null | undefined>,
  index: ReasoningAnchorIndex,
  minimumIndex: number,
): boolean {
  if (index.size === 0) {
    return false;
  }
  const indices = definedPartIndices(parts);
  for (let position = indices.length - 1; position >= 0; position -= 1) {
    const partIndex = indices[position];
    if (partIndex < minimumIndex) {
      break;
    }
    const part = parts[partIndex];
    if (
      part?.type === ContentTypes.THINK &&
      includesReasoningAnchor(textValue(part.think), index)
    ) {
      return true;
    }
  }
  return false;
}

function findTrackedToolStart(
  parts: ReadonlyArray<LooseContentPart | null | undefined>,
  activity: TrackedActivity,
): number | undefined {
  if (activity.toolCallIds != null && activity.toolCallIds.length > 0) {
    const toolStart = findBatchStart(parts, new Set(activity.toolCallIds));
    if (
      parts[toolStart]?.type === ContentTypes.TOOL_CALL &&
      activity.toolCallIds.includes(String(parts[toolStart]?.tool_call?.id ?? ''))
    ) {
      return toolStart;
    }
  }
  return undefined;
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
  for (const index of definedPartIndices(parts)) {
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
 * Collects run-wide logical activities and emits one parent summary at an
 * explicit final-answer boundary or root-run completion. The summary call is
 * detached; final-answer streams only pay the synchronous slot reservation.
 */
export function createActivityPhaseWiring(deps: ActivityPhaseHostDeps): ActivityPhaseWiring {
  const maxPerRun = deps.maxPerRun ?? DEFAULT_MAX_PER_RUN;
  const charLimit = deps.charLimit ?? DEFAULT_CHAR_LIMIT;
  const content = deps.getContentParts();
  const initialSnapshot = deps.initialSnapshot?.version === 1 ? deps.initialSnapshot : undefined;
  let generated = Math.max(
    initialSnapshot?.generated ?? 0,
    definedPartIndices(content).filter((index) => {
      const part = content[index];
      return part?.type === ContentTypes.ACTIVITY_LABEL && part.activity_label_type === 'phase';
    }).length,
  );
  const initiallyMaterializedToolIds = new Set(
    definedPartIndices(content).flatMap((index) => {
      const part = content[index];
      const id = part?.type === ContentTypes.TOOL_CALL ? part.tool_call?.id : undefined;
      return typeof id === 'string' ? [id] : [];
    }),
  );
  let activities: TrackedActivity[] =
    initialSnapshot?.activities.map((activity) => {
      const { unresolvedToolStartIndex, ...retainedActivity } = activity;
      const startIndex = findTrackedStart(content, activity);
      const toolCallIds = activity.toolCallIds ?? [];
      const hasUnresolvedTool = toolCallIds.some((id) => !initiallyMaterializedToolIds.has(id));
      return {
        ...retainedActivity,
        startIndex,
        ...(hasUnresolvedTool && {
          unresolvedToolStartIndex: Math.max(
            unresolvedToolStartIndex ?? activity.startIndex,
            startIndex,
          ),
        }),
      };
    }) ?? [];
  let activityCount = initialSnapshot?.activityCount ?? activities.length;
  let failedActivityCount =
    initialSnapshot?.failedActivityCount ??
    activities.filter((activity) => activity.status === 'error').length;
  let partialActivityCount =
    initialSnapshot?.partialActivityCount ??
    activities.filter((activity) => activity.status === 'partial').length;
  const overflowToolCallIds = new Set(initialSnapshot?.overflowToolCallIds ?? []);
  const overflowBoundaryToolCallIds = new Set(
    initialSnapshot?.overflowBoundaryToolCallIds ?? initialSnapshot?.overflowToolCallIds ?? [],
  );
  const materializedOverflowToolIds = new Set<string>();
  const rebasedOverflowToolIndexes = definedPartIndices(content).filter((index) => {
    const part = content[index];
    const toolCallId = part?.type === ContentTypes.TOOL_CALL ? part.tool_call?.id : undefined;
    const matches = typeof toolCallId === 'string' && overflowToolCallIds.has(toolCallId);
    if (matches) {
      materializedOverflowToolIds.add(toolCallId);
    }
    return matches;
  });
  const overflowReasoningAnchors = new Set<string>();
  const overflowReasoningAnchorIndex: ReasoningAnchorIndex = new Map();
  const initialOverflowReasoningAnchors =
    initialSnapshot?.overflowReasoningAnchors ??
    (initialSnapshot?.overflowReasoningExcerpt != null
      ? [initialSnapshot.overflowReasoningExcerpt]
      : []);
  for (const anchor of initialOverflowReasoningAnchors) {
    addReasoningAnchor(overflowReasoningAnchors, overflowReasoningAnchorIndex, anchor);
  }
  let rebasedOverflowReasoningIndex: number | undefined;
  if (overflowReasoningAnchors.size > 0) {
    for (const index of definedPartIndices(content)) {
      const part = content[index];
      if (
        part?.type === ContentTypes.THINK &&
        includesReasoningAnchor(textValue(part.think), overflowReasoningAnchorIndex)
      ) {
        rebasedOverflowReasoningIndex = index;
      }
    }
  }
  const rebasedOverflowStartIndex =
    rebasedOverflowToolIndexes.length > 0
      ? Math.max(...rebasedOverflowToolIndexes, rebasedOverflowReasoningIndex ?? -1)
      : rebasedOverflowReasoningIndex;
  const hasUnresolvedBoundaryTool = [...overflowBoundaryToolCallIds].some(
    (id) => !materializedOverflowToolIds.has(id),
  );
  let overflowActivityStartIndex = hasUnresolvedBoundaryTool
    ? Math.max(rebasedOverflowStartIndex ?? -1, initialSnapshot?.overflowActivityStartIndex ?? -1)
    : (rebasedOverflowStartIndex ??
      (overflowReasoningAnchors.size === 0
        ? initialSnapshot?.overflowActivityStartIndex
        : undefined));
  if (overflowActivityStartIndex != null && overflowActivityStartIndex < 0) {
    overflowActivityStartIndex = undefined;
  }
  const contributingAgentIds = new Set(initialSnapshot?.agentIds ?? []);
  let assistantContext: AssistantContextEntry[] = (initialSnapshot?.assistantContext ?? [])
    .slice(-MAX_CONTEXT_ITEMS)
    .map((text) => ({ text }));
  const pendingReasoning = new Map<string, { text: string; agentId?: string; startIndex?: number }>(
    (initialSnapshot?.pendingReasoning ?? []).map(({ key, text, agentId, startIndex }) => {
      const boundedText = text.slice(-MAX_EXCERPT_CHARS);
      const needle = boundedText.trim().slice(0, REASONING_ANCHOR_CHARS);
      const rebasedStartIndex = needle ? findReasoningStart(content, boundedText, startIndex) : -1;
      const hasMaterializedReasoning =
        needle.length > 0 &&
        content[rebasedStartIndex]?.type === ContentTypes.THINK &&
        textValue(content[rebasedStartIndex]?.think).includes(needle);
      return [
        key,
        {
          text: boundedText,
          ...(agentId != null && { agentId }),
          ...(hasMaterializedReasoning && { startIndex: rebasedStartIndex }),
        },
      ] as const;
    }),
  );
  const reasoningStepKeys = new Map<string, string>();
  const stepKinds = new Map<
    string,
    { kind: 'text' | 'think'; phase?: AssistantTextPhase; captureContext?: boolean }
  >();
  const textContextByStepId = new Map<string, AssistantContextEntry>();
  let lastRootTextStepId: string | undefined;

  const clear = () => {
    activities = [];
    assistantContext = [];
    pendingReasoning.clear();
    reasoningStepKeys.clear();
    stepKinds.clear();
    textContextByStepId.clear();
    activityCount = 0;
    failedActivityCount = 0;
    partialActivityCount = 0;
    overflowActivityStartIndex = undefined;
    overflowToolCallIds.clear();
    overflowBoundaryToolCallIds.clear();
    overflowReasoningAnchors.clear();
    overflowReasoningAnchorIndex.clear();
    contributingAgentIds.clear();
    lastRootTextStepId = undefined;
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
    } else {
      if (overflowActivityStartIndex == null || activity.startIndex > overflowActivityStartIndex) {
        overflowActivityStartIndex = activity.startIndex;
        overflowBoundaryToolCallIds.clear();
      }
      const reasoningExcerpts = activity.thinkingExcerpts;
      const reasoningExcerpt = reasoningExcerpts?.[reasoningExcerpts.length - 1]?.trim();
      if (reasoningExcerpt) {
        addReasoningAnchor(
          overflowReasoningAnchors,
          overflowReasoningAnchorIndex,
          reasoningExcerpt,
        );
      }
      for (const id of activity.toolCallIds ?? []) {
        overflowToolCallIds.add(id);
        if (activity.startIndex === overflowActivityStartIndex) {
          overflowBoundaryToolCallIds.add(id);
        }
      }
    }
  };

  const snapshot = (): ActivityPhaseSnapshot => ({
    version: 1,
    generated,
    activityCount,
    failedActivityCount,
    partialActivityCount,
    agentIds: [...contributingAgentIds],
    ...(overflowActivityStartIndex != null && { overflowActivityStartIndex }),
    ...(overflowToolCallIds.size > 0 && { overflowToolCallIds: [...overflowToolCallIds] }),
    ...(overflowActivityStartIndex != null && {
      overflowBoundaryToolCallIds: [...overflowBoundaryToolCallIds],
    }),
    ...(overflowReasoningAnchors.size > 0 && {
      overflowReasoningAnchors: [...overflowReasoningAnchors],
    }),
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
    assistantContext: assistantContext.slice(-MAX_CONTEXT_ITEMS).map(({ text }) => text),
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
      ({
        childLabelIndex,
        toolCallIds,
        startIndex: _startIndex,
        unresolvedToolStartIndex: _unresolvedToolStartIndex,
        ...activity
      }) => {
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
          child = definedPartIndices(parts)
            .map((index) => parts[index])
            .find(matchesToolIds);
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

  const close = (closingTextPhase?: AssistantTextPhase, requestedEndIndex?: number) => {
    addPendingReasoning();
    if (generated >= maxPerRun) {
      clear();
      return;
    }
    if (activityCount < MIN_ACTIVITIES) {
      clear();
      return;
    }

    generated += 1;
    const phaseIndex = generated - 1;
    const currentParts = deps.getContentParts();
    /** Child-label and phase hooks run independently. A child label can claim
     *  its slot before the corresponding tool part reaches the shared content
     *  array, leaving the phase hook with a fallback start index. Re-anchor
     *  from stable tool ids when they are available at close; the backward
     *  scan below claims unresolved leading slots without crossing visible
     *  answer content. */
    const snapshot = activities.map((activity) => {
      const toolStart = findTrackedToolStart(currentParts, activity);
      return toolStart != null ? { ...activity, startIndex: toolStart } : activity;
    });
    const contextSnapshot = assistantContext.map(({ text }) => text);
    /** Completion-finalized phases leave the final root text outside their
     *  UI bounds. Remove its matching retained excerpt from the label prompt
     *  as well, or the parent can paraphrase the answer it does not contain.
     *  Search from the tail because identical intermediate/final text should
     *  discard only the most recent capture. */
    if (requestedEndIndex != null) {
      const excludedText = textValue(currentParts[requestedEndIndex]?.text)
        .trim()
        .slice(-MAX_EXCERPT_CHARS);
      if (excludedText) {
        for (let position = contextSnapshot.length - 1; position >= 0; position -= 1) {
          if (contextSnapshot[position].trim() === excludedText) {
            contextSnapshot.splice(position, 1);
            break;
          }
        }
      }
    }
    const totalActivityCount = activityCount;
    const failedCount = failedActivityCount;
    const partialCount = partialActivityCount;
    let startIndex = Math.min(...snapshot.map((activity) => activity.startIndex));
    /** Pull leading commentary/reasoning into the parent card. A prior phase
     *  marker or steer is the only hard UI boundary; plain text can be
     *  intermediate context on providers that do not expose phase metadata. */
    const definedIndices = definedPartIndices(currentParts);
    let extendedStartIndex = 0;
    for (let position = definedIndices.length - 1; position >= 0; position -= 1) {
      const priorIndex = definedIndices[position];
      if (priorIndex >= startIndex) {
        continue;
      }
      const prior = currentParts[priorIndex];
      if (
        prior?.type === ContentTypes.STEER ||
        (prior?.type === ContentTypes.ACTIVITY_LABEL && prior.activity_label_type === 'phase') ||
        (prior?.type === ContentTypes.TEXT &&
          prior.phase === 'final_answer' &&
          textValue(prior.text).trim().length > 0)
      ) {
        extendedStartIndex = priorIndex + 1;
        break;
      }
    }
    startIndex = extendedStartIndex;
    const agentIds = [...contributingAgentIds];
    let phaseStatus: 'ok' | 'partial' | 'failed' = 'ok';
    if (failedCount === totalActivityCount) {
      phaseStatus = 'failed';
    } else if (failedCount > 0 || partialCount > 0) {
      phaseStatus = 'partial';
    }
    const index = deps.getContentParts().length;
    const endIndex = Math.max(startIndex, Math.min(index, requestedEndIndex ?? index));
    const part: LooseContentPart = {
      type: ContentTypes.ACTIVITY_LABEL,
      [ContentTypes.ACTIVITY_LABEL]: '',
      activity_label_type: 'phase',
      activity_start_index: startIndex,
      activity_end_index: endIndex,
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
    let batchStartIndex: number | undefined;
    const indices = definedPartIndices(parts);
    for (let position = indices.length - 1; position >= 0; position -= 1) {
      const index = indices[position];
      const part = parts[index];
      if (
        part?.type === ContentTypes.TOOL_CALL &&
        typeof part.tool_call?.id === 'string' &&
        ids.has(part.tool_call.id)
      ) {
        batchStartIndex = index;
      }
      if (
        childLabelIndex == null &&
        part?.type === ContentTypes.ACTIVITY_LABEL &&
        part.activity_label_type !== 'phase'
      ) {
        const childIds = Array.isArray(part.tool_call_ids) ? part.tool_call_ids : [];
        if (childIds.some((id) => typeof id === 'string' && ids.has(id))) {
          childLabelIndex = index;
        }
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
      startIndex: batchStartIndex ?? Math.max(0, parts.length - 1),
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
              if (step.groupId == null) {
                /** `final_answer` closes immediately before its text streams.
                 *  Commentary does not: if it is the root run's last text,
                 *  completion must leave it outside the parent like any
                 *  unphased answer. Later activities still invalidate this
                 *  candidate in `complete`. */
                lastRootTextStepId = phase === 'final_answer' ? undefined : step.id;
              }
              if (phase === 'final_answer' && step.groupId == null) {
                addPendingReasoning(step.agentId ?? 'root');
                stepKinds.set(step.id, { kind, phase, captureContext: false });
                close(phase);
              } else {
                if (phase == null && step.groupId == null) {
                  addPendingReasoning(step.agentId ?? 'root');
                }
                stepKinds.set(step.id, {
                  kind,
                  ...(phase != null && { phase }),
                  captureContext: true,
                });
                const contextEntry: AssistantContextEntry = { stepId: step.id, text: '' };
                assistantContext.push(contextEntry);
                textContextByStepId.set(step.id, contextEntry);
                if (assistantContext.length > MAX_CONTEXT_ITEMS) {
                  const removed = assistantContext.shift();
                  if (removed?.stepId != null) {
                    textContextByStepId.delete(removed.stepId);
                  }
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
            const contextEntry = id ? textContextByStepId.get(id) : undefined;
            if (text && contextEntry != null) {
              contextEntry.text = `${contextEntry.text}${text}`.slice(-MAX_EXCERPT_CHARS);
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

  const complete = () => {
    let finalTextIndex =
      lastRootTextStepId == null ? undefined : deps.getStepIndex?.(lastRootTextStepId);
    const parts = deps.getContentParts();
    if (
      finalTextIndex != null &&
      (parts[finalTextIndex]?.type !== ContentTypes.TEXT ||
        !textValue(parts[finalTextIndex]?.text).trim())
    ) {
      finalTextIndex = undefined;
    }
    /** The host step map is an event-coordinate hint, not the authoritative
     *  rendered position. Activity-label reservations advance the shared
     *  content offset after earlier steps were indexed, and a provider can
     *  materialize the final text at a later slot. Always reconcile against
     *  the live parts so a stale-but-defined step index cannot pull the final
     *  answer into the parent phase. */
    const definedIndices = Object.keys(parts);
    for (let position = definedIndices.length - 1; position >= 0; position -= 1) {
      const index = Number(definedIndices[position]);
      const part = parts[index];
      /** The UI contract is the last materialized TEXT part, not the last
       *  part whose provider lane metadata happens to look root-scoped.
       *  Some MCP runs retain a groupId on their final response, so even a
       *  `final_answer` part may not have taken the immediate-close branch.
       *  An already-closed phase has no remaining activities and completion
       *  is a no-op. The later-activity checks below still reject an
       *  intermediate lane text when tools or reasoning follow it. */
      if (part?.type === ContentTypes.TEXT && textValue(part.text).trim()) {
        finalTextIndex = index;
        break;
      }
    }
    if (finalTextIndex != null) {
      const candidateFinalTextIndex = finalTextIndex;
      const materializedToolIds = new Set<string>();
      const trailingToolIds = new Set<string>();
      for (const key of Object.keys(parts)) {
        const index = Number(key);
        const part = parts[index];
        if (part?.type !== ContentTypes.TOOL_CALL || typeof part.tool_call?.id !== 'string') {
          continue;
        }
        materializedToolIds.add(part.tool_call.id);
        if (index >= candidateFinalTextIndex) {
          trailingToolIds.add(part.tool_call.id);
        }
      }
      const hasLaterTrackedActivity = activities.some((activity) => {
        const toolCallIds = activity.toolCallIds ?? [];
        if (toolCallIds.some((id) => trailingToolIds.has(id))) {
          return true;
        }
        const reasoningExcerpt = activity.thinkingExcerpts?.[0];
        if (toolCallIds.length === 0 && reasoningExcerpt) {
          return hasReasoningExcerptAtOrAfter(parts, reasoningExcerpt, candidateFinalTextIndex);
        }
        return (
          toolCallIds.some((id) => !materializedToolIds.has(id)) &&
          (activity.unresolvedToolStartIndex ?? activity.startIndex) >= candidateFinalTextIndex
        );
      });
      const overflowIds = [...overflowToolCallIds];
      const overflowBoundaryIds = [...overflowBoundaryToolCallIds];
      const hasLaterOverflowActivity =
        overflowIds.some((id) => trailingToolIds.has(id)) ||
        hasIndexedReasoningAtOrAfter(
          parts,
          overflowReasoningAnchorIndex,
          candidateFinalTextIndex,
        ) ||
        (!overflowBoundaryIds.every((id) => materializedToolIds.has(id)) &&
          overflowActivityStartIndex != null &&
          overflowActivityStartIndex >= candidateFinalTextIndex);
      const pendingReasoningAnchors = new Set<string>();
      const pendingReasoningAnchorIndex: ReasoningAnchorIndex = new Map();
      let hasLaterPendingReasoningIndex = false;
      for (const reasoning of pendingReasoning.values()) {
        /** Empty reasoning reservations are not activities: addPendingReasoning
         *  deliberately drops them. They can still receive a later sparse
         *  index from the SDK, so do not let that placeholder pull a fully
         *  materialized final answer into the completed parent phase. */
        if (!reasoning.text.trim()) {
          continue;
        }
        hasLaterPendingReasoningIndex ||=
          reasoning.startIndex != null && reasoning.startIndex >= candidateFinalTextIndex;
        addReasoningAnchor(
          pendingReasoningAnchors,
          pendingReasoningAnchorIndex,
          reasoning.text,
        );
      }
      const hasLaterPendingReasoning =
        hasLaterPendingReasoningIndex ||
        hasIndexedReasoningAtOrAfter(
          parts,
          pendingReasoningAnchorIndex,
          candidateFinalTextIndex,
        );
      if (hasLaterTrackedActivity || hasLaterOverflowActivity || hasLaterPendingReasoning) {
        finalTextIndex = undefined;
      }
    }
    close(undefined, finalTextIndex);
  };

  return { hook, handlers: wrapHandlers, drop: clear, complete, snapshot };
}
