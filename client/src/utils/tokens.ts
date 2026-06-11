import { Tools, Constants } from 'librechat-data-provider';
import type { TMessage, TTokenUsageEvent, TModelTokenomics } from 'librechat-data-provider';

export interface TokenEntry {
  tokenCount: number;
  isCreatedByUser: boolean;
  parentMessageId: string | null;
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
}

export const EMPTY_BRANCH: BranchTotals = {
  input: 0,
  output: 0,
  counted: 0,
  total: 0,
  tailId: null,
  containsAnchor: false,
};

/** Module-level token index: conversationId → messageId → entry. Not render state. */
const registry = new Map<string, Map<string, TokenEntry>>();

function toEntry(message: Partial<TMessage>): TokenEntry {
  return {
    tokenCount: typeof message.tokenCount === 'number' ? message.tokenCount : 0,
    isCreatedByUser: message.isCreatedByUser === true,
    parentMessageId: message.parentMessageId ?? null,
  };
}

/** Full O(n) rebuild — only on discrete cache replacements (load, refetch, edits) */
export function buildIndex(conversationId: string, messages?: TMessage[] | null): void {
  const index = new Map<string, TokenEntry>();
  if (messages != null) {
    for (const message of messages) {
      if (message?.messageId) {
        index.set(message.messageId, toEntry(message));
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
    currentId = entry.parentMessageId;
  }

  return { ...totals, tailId };
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
 * Chars of the trailing contiguous text/think parts in aggregated content —
 * the model output produced since the last tool boundary, which the latest
 * context snapshot does not yet account for. Trailing non-text parts
 * (in-progress tool calls) are skipped before collecting.
 */
export function countTrailingOutputChars(content?: unknown[] | null): number {
  if (!Array.isArray(content) || content.length === 0) {
    return 0;
  }
  let i = content.length - 1;
  while (i >= 0 && getOutputChars(content[i]) == null) {
    i--;
  }
  let chars = 0;
  for (; i >= 0; i--) {
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

/**
 * USD cost of one model call. Mirrors the cache-detection heuristic used in
 * token accounting: cache counts are additive when they exceed base input
 * (Anthropic), otherwise cache reads are included in input tokens (OpenAI).
 */
export function calcUsageCost(usage: TTokenUsageEvent, rates?: TModelTokenomics): number {
  if (!rates || rates.prompt == null || rates.completion == null) {
    return 0;
  }
  const input = usage.input_tokens ?? 0;
  const output = usage.output_tokens ?? 0;
  const cacheWrite = usage.input_token_details?.cache_creation ?? 0;
  const cacheRead = usage.input_token_details?.cache_read ?? 0;
  const writeRate = rates.cacheWrite ?? rates.prompt;
  const readRate = rates.cacheRead ?? rates.prompt;

  const cacheIsAdditive = cacheWrite + cacheRead > input;
  const baseInput = cacheIsAdditive ? input : Math.max(0, input - cacheRead - cacheWrite);

  return (
    (baseInput * rates.prompt +
      cacheWrite * writeRate +
      cacheRead * readRate +
      output * rates.completion) /
    1e6
  );
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
