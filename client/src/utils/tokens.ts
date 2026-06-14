import { Tools, Constants, inputTokensIncludesCache } from 'librechat-data-provider';
import type { TMessage, TResponseUsage, TTokenUsageEvent } from 'librechat-data-provider';

/** Provider-reported usage of one response, in display units (post-normalize). */
export interface BranchUsage {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
  /** Authoritative USD cost; 0 when `interface.contextCost` was off at save */
  cost: number;
  /** Whether any contributing response carried a known cost — gates the cost row
   *  so turns saved without cost don't render a misleading `$0.00`. */
  costKnown: boolean;
}

export const EMPTY_USAGE: BranchUsage = {
  input: 0,
  output: 0,
  cacheWrite: 0,
  cacheRead: 0,
  cost: 0,
  costKnown: false,
};

export interface TokenEntry {
  tokenCount: number;
  isCreatedByUser: boolean;
  parentMessageId: string | null;
  /** Per-response provider usage from `metadata.usage` (response messages only) */
  usage?: BranchUsage;
}

export interface BranchTotals {
  /** Sum of user-message token counts on the active branch */
  input: number;
  /** Sum of assistant-message token counts on the active branch */
  output: number;
  /** Messages on the branch with a known tokenCount */
  counted: number;
  /** Total messages on the branch */
  total: number;
  tailId: string | null;
  /** Whether the latest run's anchor message is on this branch */
  containsAnchor: boolean;
  /** Provider usage/cost summed along the active branch */
  usage: BranchUsage;
}

export const EMPTY_BRANCH: BranchTotals = {
  input: 0,
  output: 0,
  counted: 0,
  total: 0,
  tailId: null,
  containsAnchor: false,
  usage: EMPTY_USAGE,
};

/** Module-level token index: conversationId → messageId → entry. Not render state. */
const registry = new Map<string, Map<string, TokenEntry>>();

/** Reads the persisted per-response usage rollup off a message's metadata.
 *  The backend already normalized per-event into display units, so this reads
 *  them directly. Absent for user messages and pre-feature responses (they
 *  contribute 0 to branch/total). */
function readPersistedUsage(message: Partial<TMessage>): BranchUsage | undefined {
  const usage = message.metadata?.usage;
  if (usage == null || typeof usage !== 'object') {
    return undefined;
  }
  const persisted = usage as TResponseUsage;
  return {
    input: persisted.input ?? 0,
    output: persisted.output ?? 0,
    cacheWrite: persisted.cacheWrite ?? 0,
    cacheRead: persisted.cacheRead ?? 0,
    cost: persisted.cost ?? 0,
    /** Cost is omitted when saved with `contextCost` off — don't render $0.00 */
    costKnown: typeof persisted.cost === 'number',
  };
}

/** Pure sum of two usage records — for combining branch/total with pending. */
export function mergeUsage(a: BranchUsage, b: BranchUsage): BranchUsage {
  return {
    input: a.input + b.input,
    output: a.output + b.output,
    cacheWrite: a.cacheWrite + b.cacheWrite,
    cacheRead: a.cacheRead + b.cacheRead,
    cost: a.cost + b.cost,
    costKnown: a.costKnown || b.costKnown,
  };
}

/** Accumulates one entry's usage into a running total (in place). */
function addUsage(target: BranchUsage, usage?: BranchUsage): void {
  if (usage == null) {
    return;
  }
  target.input += usage.input;
  target.output += usage.output;
  target.cacheWrite += usage.cacheWrite;
  target.cacheRead += usage.cacheRead;
  target.cost += usage.cost;
  if (usage.costKnown) {
    target.costKnown = true;
  }
}

function toEntry(message: Partial<TMessage>): TokenEntry {
  return {
    tokenCount: typeof message.tokenCount === 'number' ? message.tokenCount : 0,
    isCreatedByUser: message.isCreatedByUser === true,
    parentMessageId: message.parentMessageId ?? null,
    usage: readPersistedUsage(message),
  };
}

/** Full O(n) rebuild — only on discrete cache replacements (load, refetch, edits).
 *  Preserves a prior entry's `usage` when the rebuilt message carries none:
 *  per-message usage is immutable and the live finalize flushes it into the
 *  index (`setEntryUsage`) before the persisted `metadata.usage` reaches the
 *  cache, so a mid-session rebuild (e.g. during regenerate) must not wipe an
 *  earlier branch's flushed usage. */
export function buildIndex(conversationId: string, messages?: TMessage[] | null): void {
  const previous = registry.get(conversationId);
  const index = new Map<string, TokenEntry>();
  if (messages != null) {
    for (const message of messages) {
      if (message?.messageId) {
        const entry = toEntry(message);
        if (entry.usage == null) {
          const priorUsage = previous?.get(message.messageId)?.usage;
          if (priorUsage != null) {
            entry.usage = priorUsage;
          }
        }
        index.set(message.messageId, entry);
      }
    }
  }
  registry.set(conversationId, index);
}

/** Incremental upsert — final SSE events touch at most two entries */
export function upsertEntries(
  conversationId: string,
  messages: (Partial<TMessage> | null | undefined)[],
): void {
  let index = registry.get(conversationId);
  if (!index) {
    index = new Map<string, TokenEntry>();
    registry.set(conversationId, index);
  }
  for (const message of messages) {
    if (message?.messageId) {
      index.set(message.messageId, toEntry(message));
    }
  }
}

/** Re-keys the index when `new` resolves to a real conversation id */
export function migrateIndex(fromId: string, toId: string): void {
  if (fromId === toId) {
    return;
  }
  const index = registry.get(fromId);
  if (!index) {
    return;
  }
  registry.delete(fromId);
  registry.set(toId, index);
}

export function clearIndex(conversationId: string): void {
  registry.delete(conversationId);
}

export function hasIndex(conversationId: string): boolean {
  return registry.has(conversationId);
}

/** O(depth) walk from the branch tail up the parent chain */
export function sumBranch(
  conversationId: string,
  tailId: string | null | undefined,
  anchorId?: string | null,
): BranchTotals {
  const index = registry.get(conversationId);
  if (!index || !tailId) {
    return EMPTY_BRANCH;
  }

  const totals = { input: 0, output: 0, counted: 0, total: 0, containsAnchor: false };
  const usage: BranchUsage = { ...EMPTY_USAGE };
  let currentId: string | null = tailId;
  let guard = index.size;

  while (currentId && currentId !== Constants.NO_PARENT && guard-- > 0) {
    const entry: TokenEntry | undefined = index.get(currentId);
    if (!entry) {
      break;
    }
    totals.total += 1;
    if (anchorId != null && currentId === anchorId) {
      totals.containsAnchor = true;
    }
    if (entry.tokenCount > 0) {
      totals.counted += 1;
      if (entry.isCreatedByUser) {
        totals.input += entry.tokenCount;
      } else {
        totals.output += entry.tokenCount;
      }
    }
    addUsage(usage, entry.usage);
    currentId = entry.parentMessageId;
  }

  return { ...totals, tailId, usage };
}

/**
 * Sums provider usage/cost across EVERY message in the conversation (all
 * branches, including regenerated/abandoned responses) — the conversation
 * total, shown alongside the branch figure when they differ.
 */
export function sumTotalUsage(conversationId: string): BranchUsage {
  const usage: BranchUsage = { ...EMPTY_USAGE };
  const index = registry.get(conversationId);
  if (!index) {
    return usage;
  }
  for (const entry of index.values()) {
    addUsage(usage, entry.usage);
  }
  return usage;
}

/**
 * Attaches a response's usage to its index entry. Used by the live finalize
 * path to flush the in-flight accumulator into the index once the response is
 * counted (the persisted `metadata.usage` reaches `buildIndex` on reload).
 */
export function setEntryUsage(conversationId: string, messageId: string, usage: BranchUsage): void {
  const entry = registry.get(conversationId)?.get(messageId);
  if (entry) {
    entry.usage = usage;
  }
}

/**
 * Walks the branch tail up the parent chain and returns the first message id
 * present in `anchors` — i.e. the deepest (most recent) stored snapshot anchor
 * on the viewed branch. Used to recover a branch's granular breakdown after a
 * later generation on a sibling branch overwrote the live snapshot.
 */
export function findBranchSnapshotAnchor(
  conversationId: string,
  tailId: string | null | undefined,
  anchors: ReadonlyMap<string, unknown>,
): string | null {
  const index = registry.get(conversationId);
  if (!index || !tailId || anchors.size === 0) {
    return null;
  }

  let currentId: string | null = tailId;
  let guard = index.size;

  while (currentId && currentId !== Constants.NO_PARENT && guard-- > 0) {
    if (anchors.has(currentId)) {
      return currentId;
    }
    const entry: TokenEntry | undefined = index.get(currentId);
    if (!entry) {
      break;
    }
    currentId = entry.parentMessageId;
  }

  return null;
}

export interface ToolTokenGroups {
  system: number;
  mcp: number;
  skills: number;
  subagents: number;
  systemDeferred: number;
  mcpDeferred: number;
}

export const EMPTY_TOOL_GROUPS: ToolTokenGroups = {
  system: 0,
  mcp: 0,
  skills: 0,
  subagents: 0,
  systemDeferred: 0,
  mcpDeferred: 0,
};

/**
 * Classifies per-tool schema tokens into display groups: built-in system
 * tools, MCP tools, skills, and subagents — with deferred (on-demand) tools
 * split out for the system/MCP groups.
 */
export function groupToolTokens(
  toolTokenCounts?: Record<string, number>,
  deferredToolNames?: string[],
): ToolTokenGroups {
  if (toolTokenCounts == null) {
    return EMPTY_TOOL_GROUPS;
  }
  const deferred = new Set(deferredToolNames ?? []);
  const groups = { ...EMPTY_TOOL_GROUPS };
  for (const [name, tokens] of Object.entries(toolTokenCounts)) {
    if (tokens <= 0) {
      continue;
    }
    if (name === Tools.skill) {
      groups.skills += tokens;
    } else if (name === Constants.SUBAGENT) {
      groups.subagents += tokens;
    } else if (name.includes(Constants.mcp_delimiter)) {
      if (deferred.has(name)) {
        groups.mcpDeferred += tokens;
      } else {
        groups.mcp += tokens;
      }
    } else if (deferred.has(name)) {
      groups.systemDeferred += tokens;
    } else {
      groups.system += tokens;
    }
  }
  return groups;
}

function getOutputChars(part: unknown): number | null {
  if (part == null || typeof part !== 'object') {
    return null;
  }
  const { text, think } = part as { text?: unknown; think?: unknown };
  if (typeof text === 'string') {
    return text.length;
  }
  if (typeof think === 'string') {
    return think.length;
  }
  return null;
}

/**
 * Chars of the contiguous text/think parts at the very END of aggregated
 * content — the output the model is actively producing on the current call,
 * which the latest pre-invoke context snapshot does not yet account for.
 *
 * Crucially this does NOT skip a trailing tool-call part: once the model has
 * emitted a tool call, that call's text is already folded into the next
 * snapshot's `messageTokens`, so counting it would double-count against the
 * snapshot. A tool call at the end therefore yields 0 (nothing new in flight).
 */
export function countTrailingOutputChars(content?: unknown[] | null): number {
  if (!Array.isArray(content) || content.length === 0) {
    return 0;
  }
  let chars = 0;
  for (let i = content.length - 1; i >= 0; i--) {
    const partChars = getOutputChars(content[i]);
    if (partChars == null) {
      break;
    }
    chars += partChars;
  }
  return chars;
}

/** Rough live estimate for streaming text, calibrated by the last known provider ratio */
export function estimateTokens(charCount: number, calibrationRatio = 1): number {
  if (charCount <= 0) {
    return 0;
  }
  const ratio = calibrationRatio > 0 ? calibrationRatio : 1;
  return Math.round((charCount / 4) * ratio);
}

/** Billable token quantities of one or more model calls, normalized for pricing */
export interface CostUnits {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
}

/**
 * Normalizes one call's usage into billable units, mirroring the backend's
 * authoritative `splitUsage`/`resolveCompletionTokens`
 * (packages/api/src/agents/usage.ts):
 *   - cache classification is by provider, not magnitude — Anthropic/Bedrock
 *     keep cache additive (input is uncached-only); subset providers fold
 *     cache into `input_tokens`. Falls back to a magnitude heuristic only when
 *     the provider is unknown.
 *   - completion is repaired for providers (e.g. Vertex) that under-report
 *     `output_tokens` but carry the gap in `total_tokens`.
 * Applied per event so units stay correct when summed across calls.
 */
export function normalizeUsageUnits(usage: TTokenUsageEvent): CostUnits {
  const rawInput = usage.input_tokens ?? 0;
  const rawOutput = usage.output_tokens ?? 0;
  const total = usage.total_tokens ?? 0;
  const cacheWrite = usage.input_token_details?.cache_creation ?? 0;
  const cacheRead = usage.input_token_details?.cache_read ?? 0;

  const includesCache =
    usage.provider != null
      ? inputTokensIncludesCache(usage.provider)
      : cacheWrite + cacheRead <= rawInput;

  const cacheAdjustment = includesCache ? 0 : cacheRead + cacheWrite;
  const output =
    total > rawInput + rawOutput + cacheAdjustment ? total - rawInput - cacheAdjustment : rawOutput;

  return {
    input: includesCache ? Math.max(0, rawInput - cacheRead - cacheWrite) : rawInput,
    output,
    cacheWrite,
    cacheRead,
  };
}

export function formatTokens(count: number): string {
  const formatted = new Intl.NumberFormat(undefined, {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(count);
  return formatted.replace(/\.0(?=[A-Za-z]|$)/, '');
}

export function formatCost(usd: number): string {
  if (usd <= 0) {
    return '$0.00';
  }
  if (usd < 0.01) {
    return '<$0.01';
  }
  if (usd < 1) {
    return `$${usd.toFixed(4)}`;
  }
  return `$${usd.toFixed(2)}`;
}
