import { useQuery } from '@tanstack/react-query';
import type { TConversation, TMessage } from 'librechat-data-provider';
import {
  Constants,
  dataService,
  isAgentsEndpoint,
  isAssistantsEndpoint,
} from 'librechat-data-provider';
import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useRecoilValue } from 'recoil';
import { useGetMessagesByConvoId } from '~/data-provider';
import { useAuthContext } from '~/hooks';
import store from '~/store';
import { DEV_DEBUG_OVERLAY_STORAGE_KEY } from './devDebugOverlayConstants';

/** Billing rule for debug display: 1 USD per 1e6 tokens */
const TOKENS_PER_USD = 1_000_000;

/**
 * Subset of api/models/tx.js tokenValues — used only for debug billing display.
 * Order matters: findBillingMatch iterates in REVERSE, so more-specific entries must come LAST.
 * Rates are USD per 1 M tokens.
 */
/**
 * Mirrors tx.js tokenValues (main object only, no bedrockValues) in the EXACT same key order.
 * Order is critical: findBillingMatch iterates REVERSE, so last key = highest priority.
 * Generic patterns must come BEFORE specific ones (e.g. `o1` before `o1-mini`).
 */
const debugBillingRates: Record<string, { prompt: number; completion: number }> = {
  // ── Generic fallbacks (lowest priority — appear early, checked last in reverse) ───────
  'claude-': { prompt: 0.8, completion: 2.4 },
  deepseek: { prompt: 0.28, completion: 0.42 },
  command: { prompt: 0.38, completion: 0.38 },
  gemma: { prompt: 0.02, completion: 0.04 },
  gemini: { prompt: 0.5, completion: 1.5 },
  'gpt-oss': { prompt: 0.05, completion: 0.2 },
  grok: { prompt: 2.0, completion: 10.0 },
  kimi: { prompt: 0.6, completion: 2.5 },
  // ── o-series (generic BEFORE specific — same fixed order as tx.js) ───────────────────
  o1: { prompt: 15, completion: 60 },
  'o1-mini': { prompt: 1.1, completion: 4.4 },
  'o1-preview': { prompt: 15, completion: 60 },
  o3: { prompt: 2, completion: 8 },
  'o3-mini': { prompt: 1.1, completion: 4.4 },
  'o3-deep-research': { prompt: 10, completion: 40 },
  'o4-mini': { prompt: 1.1, completion: 4.4 },
  // ── GPT-4.x ──────────────────────────────────────────────────────────────────────────
  'gpt-4-1106': { prompt: 10, completion: 30 },
  'gpt-4.1': { prompt: 2, completion: 8 },
  'gpt-4.1-nano': { prompt: 0.1, completion: 0.4 },
  'gpt-4.1-mini': { prompt: 0.4, completion: 1.6 },
  'gpt-4.5': { prompt: 75, completion: 150 },
  'gpt-4o': { prompt: 2.5, completion: 10 },
  'gpt-4o-mini': { prompt: 0.15, completion: 0.6 },
  // ── GPT-5.x ──────────────────────────────────────────────────────────────────────────
  'gpt-5': { prompt: 1.25, completion: 10 },
  'gpt-5-nano': { prompt: 0.05, completion: 0.4 },
  'gpt-5-mini': { prompt: 0.25, completion: 2 },
  'gpt-5-pro': { prompt: 15, completion: 120 },
  'gpt-5.2': { prompt: 1.75, completion: 14 },
  'gpt-5.4': { prompt: 2.5, completion: 15 },
  // ── Claude ───────────────────────────────────────────────────────────────────────────
  'claude-instant': { prompt: 0.8, completion: 2.4 },
  'claude-2': { prompt: 8, completion: 24 },
  'claude-2.1': { prompt: 8, completion: 24 },
  'claude-3-haiku': { prompt: 0.25, completion: 1.25 },
  'claude-3-sonnet': { prompt: 3, completion: 15 },
  'claude-3-opus': { prompt: 15, completion: 75 },
  'claude-3-5-haiku': { prompt: 0.8, completion: 4 },
  'claude-3.5-haiku': { prompt: 0.8, completion: 4 },
  'claude-3-5-sonnet': { prompt: 3, completion: 15 },
  'claude-3.5-sonnet': { prompt: 3, completion: 15 },
  'claude-3-7-sonnet': { prompt: 3, completion: 15 },
  'claude-3.7-sonnet': { prompt: 3, completion: 15 },
  'claude-haiku-4-5': { prompt: 1, completion: 5 },
  'claude-opus-4-5': { prompt: 5, completion: 25 },
  'claude-opus-4-6': { prompt: 5, completion: 25 },
  'claude-opus-4.6': { prompt: 5, completion: 25 },
  'claude-sonnet-4-5': { prompt: 3, completion: 15 },
  'claude-sonnet-4-6': { prompt: 3, completion: 15 },
  'claude-opus-4-7': { prompt: 5, completion: 25 },
  // ── Command ───────────────────────────────────────────────────────────────────────────
  'command-r': { prompt: 0.5, completion: 1.5 },
  'command-r-plus': { prompt: 3, completion: 15 },
  'command-text': { prompt: 1.5, completion: 2.0 },
  // ── DeepSeek ──────────────────────────────────────────────────────────────────────────
  'deepseek-reasoner': { prompt: 0.28, completion: 0.42 },
  'deepseek-r1': { prompt: 0.4, completion: 2.0 },
  'deepseek-v3': { prompt: 0.2, completion: 0.8 },
  // ── Gemma ─────────────────────────────────────────────────────────────────────────────
  'gemma-2': { prompt: 0.01, completion: 0.03 },
  'gemma-3': { prompt: 0.02, completion: 0.04 },
  'gemma-3-27b': { prompt: 0.09, completion: 0.16 },
  // ── Gemini (exact tx.js order — more specific always comes AFTER generic) ─────────────
  'gemini-1.5': { prompt: 2.5, completion: 10 },
  'gemini-1.5-flash': { prompt: 0.15, completion: 0.6 },
  'gemini-1.5-flash-8b': { prompt: 0.075, completion: 0.3 },
  'gemini-2.0': { prompt: 0.1, completion: 0.4 },
  'gemini-2.0-flash': { prompt: 0.1, completion: 0.4 },
  'gemini-2.0-flash-lite': { prompt: 0.075, completion: 0.3 },
  'gemini-2.5': { prompt: 0.3, completion: 2.5 },
  'gemini-2.5-flash': { prompt: 0.3, completion: 2.5 },
  'gemini-2.5-flash-lite': { prompt: 0.1, completion: 0.4 },
  'gemini-2.5-pro': { prompt: 1.25, completion: 10 },
  'gemini-3': { prompt: 2, completion: 12 },
  'gemini-2.5-flash-image': { prompt: 0.15, completion: 30 },
  'gemini-3-flash-preview': { prompt: 0.5, completion: 3 },
  'gemini-3-pro-preview': { prompt: 2, completion: 12 },
  'gemini-3-flash': { prompt: 0.5, completion: 3 },
  'gemini-3-pro': { prompt: 2, completion: 12 },
  'gemini-3-pro-image': { prompt: 2, completion: 120 },
  'gemini-3.1-pro': { prompt: 2, completion: 12 },
  'gemini-3.1-flash-lite-preview': { prompt: 0.25, completion: 1.5 },
  'gemini-pro-vision': { prompt: 0.5, completion: 1.5 },
  // ── Grok (exact tx.js order) ──────────────────────────────────────────────────────────
  'grok-beta': { prompt: 5.0, completion: 15.0 },
  'grok-2': { prompt: 2.0, completion: 10.0 },
  'grok-3': { prompt: 3.0, completion: 15.0 },
  'grok-3-fast': { prompt: 5.0, completion: 25.0 },
  'grok-3-mini': { prompt: 0.3, completion: 0.5 },
  'grok-3-mini-fast': { prompt: 0.6, completion: 4 },
  'grok-4': { prompt: 3.0, completion: 15.0 },
  'grok-4-1-fast': { prompt: 0.2, completion: 0.5 },
  'grok-4.3': { prompt: 1.25, completion: 2.5 },
  'grok-code-fast': { prompt: 0.2, completion: 1.5 },
  // ── Mistral ───────────────────────────────────────────────────────────────────────────
  'mistral-nemo': { prompt: 0.15, completion: 0.15 },
  'mistral-large': { prompt: 2.0, completion: 6.0 },
};

/**
 * Replicates the findMatchingPattern logic from tx.js:
 * iterates keys in REVERSE (last = most specific = wins).
 */
function findBillingMatch(
  model: string,
): { key: string; prompt: number; completion: number } | null {
  if (!model || model === '—') {
    return null;
  }
  const lower = model.toLowerCase();
  const keys = Object.keys(debugBillingRates);
  for (let i = keys.length - 1; i >= 0; i--) {
    if (lower.includes(keys[i])) {
      return { key: keys[i], ...debugBillingRates[keys[i]] };
    }
  }
  return null;
}

const DEV_DEBUG_MESSAGE_QUERY_KEY = 'devDebugMessage' as const;

type TMessageWithUsage = TMessage & {
  tokenCount?: number;
  summaryTokenCount?: number;
  metadata?: Record<string, unknown>;
};

/** API may return one document or an array of one (legacy route behaviour). */
function normalizeFetchedMessage(data: unknown): TMessageWithUsage | null {
  if (data == null) {
    return null;
  }
  if (Array.isArray(data)) {
    const first = data[0];
    if (first && typeof first === 'object') {
      return first as TMessageWithUsage;
    }
    return null;
  }
  if (typeof data === 'object') {
    return data as TMessageWithUsage;
  }
  return null;
}

/** Resolve `usage` object from message metadata (OpenAI / Anthropic / agents shapes). */
function getUsageObjectFromMetadata(
  metadata: Record<string, unknown> | undefined,
): Record<string, unknown> | null {
  if (!metadata || typeof metadata !== 'object') {
    return null;
  }
  const usage = metadata.usage;
  if (usage && typeof usage === 'object') {
    return usage as Record<string, unknown>;
  }
  const usageMetadata = metadata.usage_metadata;
  if (usageMetadata && typeof usageMetadata === 'object') {
    return usageMetadata as Record<string, unknown>;
  }
  return null;
}

/** Some providers/clients spread `usage` directly onto the message object (not inside `metadata`). */
function getUsageObjectFromMessage(
  msg: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!msg || typeof msg !== 'object') {
    return null;
  }

  // First: metadata.* shapes (OpenAI / Anthropic style)
  const metadata = msg.metadata;
  if (metadata && typeof metadata === 'object') {
    const usageObj = getUsageObjectFromMetadata(metadata as Record<string, unknown>);
    if (usageObj) {
      return usageObj;
    }
  }

  // Second: top-level usage.* shapes (some Agent flows)
  const usage = (msg as Record<string, unknown>).usage;
  if (usage && typeof usage === 'object') {
    return usage as Record<string, unknown>;
  }

  const usageMetadata = (msg as Record<string, unknown>).usage_metadata;
  if (usageMetadata && typeof usageMetadata === 'object') {
    return usageMetadata as Record<string, unknown>;
  }

  return null;
}

function sumTokenDetailRecord(details: unknown): number {
  if (!details || typeof details !== 'object') {
    return 0;
  }
  return Object.values(details as Record<string, unknown>).reduce<number>((acc, v) => {
    if (typeof v === 'number' && !Number.isNaN(v)) {
      return acc + Math.max(0, v);
    }
    return acc;
  }, 0);
}

/**
 * Best-effort total tokens from a provider `usage` blob (prompt+completion / input+output+cache).
 * Prefer structured totals over `message.tokenCount`, which is often completion-only (see BaseClient).
 */
function extractUsageTotals(usage: Record<string, unknown>): number | null {
  if (usage.total_tokens != null) {
    const tt = Number(usage.total_tokens);
    if (!Number.isNaN(tt)) {
      return Math.max(0, tt);
    }
  }

  const hasPromptKey =
    'prompt_tokens' in usage && usage.prompt_tokens !== undefined && usage.prompt_tokens !== null;
  const hasCompletionKey =
    'completion_tokens' in usage &&
    usage.completion_tokens !== undefined &&
    usage.completion_tokens !== null;
  if (hasPromptKey || hasCompletionKey) {
    const pt = Math.max(0, Number(usage.prompt_tokens) || 0);
    const ct = Math.max(0, Number(usage.completion_tokens) || 0);
    return pt + ct;
  }

  const inputTokens = Number(usage.input_tokens);
  const outputTokens = Number(usage.output_tokens);
  const cacheRead = Number(usage.cache_read_input_tokens);
  const cacheCreate = Number(usage.cache_creation_input_tokens);
  const it = Number.isNaN(inputTokens) ? 0 : Math.max(0, inputTokens);
  const ot = Number.isNaN(outputTokens) ? 0 : Math.max(0, outputTokens);
  const cr = Number.isNaN(cacheRead) ? 0 : Math.max(0, cacheRead);
  const cc = Number.isNaN(cacheCreate) ? 0 : Math.max(0, cacheCreate);
  if (it > 0 || ot > 0 || cr > 0 || cc > 0) {
    return it + ot + cr + cc;
  }

  const dIn = sumTokenDetailRecord(usage.input_token_details);
  const dOut = sumTokenDetailRecord(usage.output_token_details);
  if (dIn > 0 || dOut > 0) {
    return dIn + dOut;
  }

  return null;
}

/**
 * Total tokens for debug/USD: metadata usage first (full prompt+completion where available),
 * then summaryTokenCount, then DB `tokenCount` (may be output-only).
 */
function getTokenTotalForMessage(msg: TMessageWithUsage): number | null {
  const usageObj = getUsageObjectFromMessage(msg);
  if (usageObj) {
    const fromUsage = extractUsageTotals(usageObj);
    if (fromUsage !== null) {
      return fromUsage;
    }
  }

  // DB might store as number, but some providers/serializers can return numeric strings.
  const summaryRaw = (msg as unknown as { summaryTokenCount?: number | string | null })
    .summaryTokenCount;
  const tokenCountRaw = (msg as unknown as { tokenCount?: number | string | null }).tokenCount;

  if (summaryRaw != null) {
    const n = Number(summaryRaw);
    if (!Number.isNaN(n) && n > 0) {
      return Math.max(0, n);
    }
  }

  if (tokenCountRaw != null) {
    const n = Number(tokenCountRaw);
    if (!Number.isNaN(n)) {
      return Math.max(0, n);
    }
  }

  return null;
}

/** Returns sorted "key: value" lines for every field in the usage object. */
function formatUsageEntries(msg: Record<string, unknown> | undefined | null): string[] {
  const u = getUsageObjectFromMessage(msg);
  if (!u) {
    return ['  —'];
  }
  return Object.entries(u)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => {
      const display = v !== null && typeof v === 'object' ? JSON.stringify(v) : String(v);
      return `  ${k}: ${display}`;
    });
}

/**
 * Mirrors the exact token-extraction logic from the backend clients.
 *
 * Agents endpoint (callbacks.js → recordCollectedUsage):
 *   Normalises first: input_tokens = input_tokens ?? prompt_tokens
 *   Then bills:
 *     input   = usage.input_tokens
 *     output  = usage.output_tokens
 *     cacheW  = usage.input_token_details?.cache_creation   (structured path)
 *     cacheR  = usage.input_token_details?.cache_read       (structured path)
 *   NOTE: reasoning_tokens is NOT billed separately here.
 *
 * OpenAI / xAI direct (BaseClient, inputTokensKey = 'prompt_tokens'):
 *   prompt  = usage.prompt_tokens
 *   compl   = usage.completion_tokens
 *   + extra = usage.reasoning_tokens (second spendTokens call, billed as completion)
 *
 * Anthropic direct (AnthropicClient, inputTokensKey = 'input_tokens'):
 *   input   = usage.input_tokens
 *   cacheW  = usage.cache_creation_input_tokens   (root-level key)
 *   cacheR  = usage.cache_read_input_tokens        (root-level key)
 *   compl   = usage.output_tokens
 *   (cache write/read use different rates — approximated here with prompt rate, marked *)
 *
 * Google direct (GoogleClient, inputTokensKey = 'input_tokens'):
 *   prompt  = usage.input_tokens / promptTokenCount
 *   compl   = usage.output_tokens / candidatesTokenCount
 */
function calcRealUsd(
  usageObj: Record<string, unknown> | null,
  billing: { prompt: number; completion: number } | null,
  totalTokens: number | null,
  isAgents: boolean,
): { usd: number; label: string } | null {
  if (usageObj && billing) {
    // ── Agents endpoint path ────────────────────────────────────────────
    // callbacks.js normalises: input_tokens = input_tokens ?? prompt_tokens
    // recordCollectedUsage reads input_token_details for cache fields.
    if (isAgents) {
      const input = Math.max(0, Number(usageObj.input_tokens ?? usageObj.prompt_tokens) || 0);
      const compl = Math.max(0, Number(usageObj.output_tokens ?? usageObj.completion_tokens) || 0);
      const details = usageObj.input_token_details;
      const cacheW =
        details && typeof details === 'object'
          ? Math.max(0, Number((details as Record<string, unknown>).cache_creation) || 0)
          : 0;
      const cacheR =
        details && typeof details === 'object'
          ? Math.max(0, Number((details as Record<string, unknown>).cache_read) || 0)
          : 0;

      const usd =
        (input * billing.prompt +
          cacheW * billing.prompt +
          cacheR * billing.prompt +
          compl * billing.completion) /
        TOKENS_PER_USD;

      const parts: string[] = [];
      if (input > 0) parts.push(`in ${input}×$${billing.prompt}`);
      if (cacheW > 0) parts.push(`cacheW ${cacheW}×$${billing.prompt}*`);
      if (cacheR > 0) parts.push(`cacheR ${cacheR}×$${billing.prompt}*`);
      if (compl > 0) parts.push(`out ${compl}×$${billing.completion}`);
      const cacheSuffix = cacheW > 0 || cacheR > 0 ? '  (*cache rates approx)' : '';
      return { usd, label: `agents: ${parts.join(' + ')} /M${cacheSuffix}` };
    }

    // ── OpenAI / xAI direct (prompt_tokens / completion_tokens) ─────────
    const hasOpenAIKeys = usageObj.prompt_tokens != null || usageObj.completion_tokens != null;
    if (hasOpenAIKeys) {
      const p = Math.max(0, Number(usageObj.prompt_tokens) || 0);
      const c = Math.max(0, Number(usageObj.completion_tokens) || 0);
      // reasoning_tokens → second spendTokens call billed as completion
      const r = Math.max(0, Number(usageObj.reasoning_tokens) || 0);
      const usd = (p * billing.prompt + (c + r) * billing.completion) / TOKENS_PER_USD;
      const parts: string[] = [];
      if (p > 0) parts.push(`prompt ${p}×$${billing.prompt}`);
      if (c > 0) parts.push(`compl ${c}×$${billing.completion}`);
      if (r > 0) parts.push(`reason ${r}×$${billing.completion}`);
      return { usd, label: `${parts.join(' + ')} /M` };
    }

    // ── Anthropic / Google direct (input_tokens / output_tokens) ─────────
    const hasAnthropicKeys = usageObj.input_tokens != null || usageObj.output_tokens != null;
    if (hasAnthropicKeys) {
      const input = Math.max(0, Number(usageObj.input_tokens) || 0);
      // Anthropic stores cache in root-level keys (not inside input_token_details)
      const write = Math.max(0, Number(usageObj.cache_creation_input_tokens) || 0);
      const read = Math.max(0, Number(usageObj.cache_read_input_tokens) || 0);
      const compl = Math.max(0, Number(usageObj.output_tokens) || 0);
      const usd =
        ((input + write + read) * billing.prompt + compl * billing.completion) / TOKENS_PER_USD;
      const parts: string[] = [];
      if (input > 0) parts.push(`in ${input}×$${billing.prompt}`);
      if (write > 0) parts.push(`cacheW ${write}×$${billing.prompt}*`);
      if (read > 0) parts.push(`cacheR ${read}×$${billing.prompt}*`);
      if (compl > 0) parts.push(`out ${compl}×$${billing.completion}`);
      const cacheSuffix = write > 0 || read > 0 ? '  (*cache rates approx)' : '';
      return { usd, label: `${parts.join(' + ')} /M${cacheSuffix}` };
    }
  }

  if (totalTokens !== null) {
    return { usd: totalTokens / TOKENS_PER_USD, label: 'flat $1/M (no rate match)' };
  }
  return null;
}

function findLastAssistantMessage(messages: TMessage[] | undefined): TMessageWithUsage | null {
  if (!messages?.length) {
    return null;
  }
  for (let i = messages.length - 1; i >= 0; i--) {
    if (!messages[i].isCreatedByUser) {
      return messages[i] as TMessageWithUsage;
    }
  }
  return null;
}

/** Model id used for the API call: streaming shell, then last assistant message, then conversation. */
function resolveDebugModel(
  conversation: TConversation | null,
  latestMessage: TMessage | null,
  lastAssistant: TMessageWithUsage | null,
): string {
  if (latestMessage && latestMessage.isCreatedByUser === false && latestMessage.model) {
    return String(latestMessage.model);
  }
  if (lastAssistant?.model) {
    return String(lastAssistant.model);
  }
  if (conversation?.model) {
    return String(conversation.model);
  }
  const endpoint = conversation?.endpoint ?? null;
  if (endpoint && isAgentsEndpoint(endpoint) && conversation?.agent_id) {
    return `(agent) ${conversation.agent_id}`;
  }
  if (endpoint && isAssistantsEndpoint(endpoint) && conversation?.assistant_id) {
    return `(assistant) ${conversation.assistant_id}`;
  }
  return '—';
}

export default function DevDebugOverlayPanel() {
  const { conversationId: routeConvoId = '' } = useParams<{ conversationId?: string }>();
  const { isAuthenticated } = useAuthContext();
  const conversation = useRecoilValue(store.conversationByIndex(0));
  const latestMessage = useRecoilValue(store.latestMessageFamily(0));

  const conversationId = routeConvoId || (conversation?.conversationId ?? '');

  const { data: messages } = useGetMessagesByConvoId(conversationId, {
    enabled: isAuthenticated && !!conversationId,
  });

  const lastAssistant = useMemo(() => findLastAssistantMessage(messages), [messages]);
  const lastAssistantId = lastAssistant?.messageId;

  const canFetchDebugMessage =
    import.meta.env.DEV &&
    isAuthenticated &&
    !!conversationId &&
    !!lastAssistantId &&
    conversationId !== Constants.NEW_CONVO &&
    conversationId !== Constants.PENDING_CONVO;

  const { data: rawFetchedMessage } = useQuery({
    queryKey: [DEV_DEBUG_MESSAGE_QUERY_KEY, conversationId, lastAssistantId],
    queryFn: () =>
      canFetchDebugMessage
        ? dataService.getMessageByConvoAndId(conversationId, lastAssistantId as string)
        : Promise.resolve(null),
    enabled: canFetchDebugMessage,
    staleTime: 30_000,
    retry: 1,
  });

  const freshMessage = useMemo(
    () => normalizeFetchedMessage(rawFetchedMessage),
    [rawFetchedMessage],
  );

  const resolvedModel = useMemo(
    () => resolveDebugModel(conversation, latestMessage, lastAssistant),
    [conversation, latestMessage, lastAssistant],
  );

  const tokenTotal = useMemo(() => {
    if (!lastAssistant) {
      return null;
    }
    if (freshMessage) {
      const fromDb = getTokenTotalForMessage(freshMessage);
      if (fromDb !== null) {
        return fromDb;
      }
    }
    return getTokenTotalForMessage(lastAssistant);
  }, [lastAssistant, freshMessage]);

  const usageKeysSource = freshMessage ?? lastAssistant;

  const billingMatch = useMemo(() => findBillingMatch(resolvedModel), [resolvedModel]);

  const usageMetadataLines = useMemo(
    () => formatUsageEntries(usageKeysSource as unknown as Record<string, unknown> | null),
    [usageKeysSource],
  );

  const isAgentsEndpoint_ = isAgentsEndpoint(conversation?.endpoint ?? '');

  const realUsdResult = useMemo(() => {
    const usageObj = getUsageObjectFromMessage(
      usageKeysSource as unknown as Record<string, unknown> | null,
    );
    return calcRealUsd(usageObj, billingMatch, tokenTotal, isAgentsEndpoint_);
  }, [usageKeysSource, billingMatch, tokenTotal, isAgentsEndpoint_]);

  const creditsLastAssistant = useMemo(
    () => (realUsdResult !== null ? realUsdResult.usd * TOKENS_PER_USD : null),
    [realUsdResult],
  );

  const lines = [
    'LibreChat dev debug',
    `Toggle: Ctrl+Shift+.  ·  localStorage: ${DEV_DEBUG_OVERLAY_STORAGE_KEY}`,
    '',
    `conversationId route: ${routeConvoId || '—'}`,
    `conversationId recoil[0]: ${conversation?.conversationId ?? '—'}`,
    `messages query id: ${conversationId || '—'}`,
    `effectiveModel: ${resolvedModel}`,
    `lastAssistantMessageId: ${lastAssistant?.messageId ?? '—'}`,
    'usageMetadata:',
    ...usageMetadataLines,
    `billingKey (tx.js): ${
      billingMatch
        ? `${billingMatch.key} | prompt $${billingMatch.prompt}/M | completion $${billingMatch.completion}/M`
        : '— (model not in debugBillingRates)'
    }`,
    `tokensLastAssistant: ${tokenTotal !== null ? String(tokenTotal) : '—'}`,
    `usdLastAssistant: ${
      realUsdResult !== null ? `$${realUsdResult.usd.toFixed(6)}  (${realUsdResult.label})` : '—'
    }`,
    `creditsLastAssistant: ${creditsLastAssistant !== null ? creditsLastAssistant.toFixed(2) : '—'}`,
  ];

  return (
    <div
      className="fixed bottom-2 left-2 z-[900] max-h-[min(40vh,320px)] w-[min(92vw,420px)] overflow-auto rounded-md border border-amber-700/60 bg-zinc-950/90 p-2 font-mono text-[11px] leading-snug text-amber-100 shadow-lg backdrop-blur-sm"
      data-testid="dev-debug-overlay-panel"
    >
      <pre className="whitespace-pre-wrap break-all">{lines.join('\n')}</pre>
    </div>
  );
}
