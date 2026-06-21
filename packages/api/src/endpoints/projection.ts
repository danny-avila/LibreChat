import { HumanMessage, AIMessage } from '@langchain/core/messages';
import { Providers, createTokenCounter, projectAgentContextUsage } from '@librechat/agents';
import type { TContextProjectionRequest, TContextUsageEvent } from 'librechat-data-provider';
import type { BaseMessage } from '@langchain/core/messages';
import { mergeQuotedText } from '~/utils/quotes';

interface ProjectionMessage {
  messageId: string;
  parentMessageId?: string | null;
  tokenCount?: number;
  isCreatedByUser?: boolean;
  text?: string;
  /** Quoted excerpts merged into the model-facing text by the live path; must be
   *  included here so the context gauge counts the same prompt the model sees. */
  quotes?: string[];
  /** Compaction marker written by the live path (`agents/usage.ts`); its
   *  presence means the next call sends the summary + tail, not this raw chain. */
  metadata?: { summaryUsedTokens?: number };
}

export interface ContextProjectionDeps {
  /** Authenticated requester — branch lookups are scoped to this user. */
  userId?: string;
  getMessages: (
    filter: { conversationId: string; user?: string },
    select?: string,
  ) => Promise<ProjectionMessage[]>;
}

/**
 * Walks the parent chain from `tailId` to root and returns the branch messages
 * oldest→newest. The visited set guards against cycles / self-referential links.
 */
function resolveBranch(messages: ProjectionMessage[], tailId: string): ProjectionMessage[] {
  const byId = new Map<string, ProjectionMessage>();
  for (const message of messages) {
    byId.set(message.messageId, message);
  }
  const branch: ProjectionMessage[] = [];
  const seen = new Set<string>();
  let currentId: string | null | undefined = tailId;
  while (currentId != null && !seen.has(currentId)) {
    const message = byId.get(currentId);
    if (message == null) {
      break;
    }
    seen.add(currentId);
    branch.push(message);
    currentId = message.parentMessageId;
  }
  return branch.reverse();
}

/** Maps an endpoint/provider string to the agents `Providers` enum. */
function resolveProvider(value?: string): Providers {
  if (value == null || value === '') {
    return Providers.OPENAI;
  }
  const lower = value.toLowerCase();
  for (const provider of Object.values(Providers)) {
    if (provider.toLowerCase() === lower) {
      return provider;
    }
  }
  if (lower.includes('anthropic') || lower.includes('claude')) {
    return Providers.ANTHROPIC;
  }
  if (lower.includes('google') || lower.includes('gemini') || lower.includes('vertex')) {
    return Providers.GOOGLE;
  }
  if (lower.includes('bedrock')) {
    return Providers.BEDROCK;
  }
  return Providers.OPENAI;
}

/**
 * Server-side context-usage projection: reconstructs the viewed branch and asks
 * the agents SDK what the next call's context would be, WITHOUT invoking the
 * model. Provider/model/window come from the (client-resolved) request — no
 * agent or model-spec config is loaded here, so there is no cross-user config
 * exposure. Reuses LibreChat's already-calibrated per-message `tokenCount`s (no
 * re-tokenizing). Returns null when there is no resolvable context window.
 * NOTE: this first cut targets message-windowing accuracy — instruction and
 * tool-schema tokens (agent instructions, `promptPrefix`, model-spec presets,
 * tool schemas) are NOT yet included; a follow-up will reuse the full
 * `initializeAgent`/send path for exact overhead and proper access control.
 */
export async function resolveContextProjection(
  deps: ContextProjectionDeps,
  params: TContextProjectionRequest,
): Promise<TContextUsageEvent | null> {
  const maxContextTokens = params.maxContextTokens;
  if (maxContextTokens == null || maxContextTokens <= 0) {
    return null;
  }

  const stored = await deps.getMessages(
    { conversationId: params.conversationId, user: deps.userId },
    'messageId parentMessageId tokenCount isCreatedByUser text quotes metadata',
  );
  const branch = resolveBranch(stored, params.messageId);
  if (branch.length === 0) {
    return null;
  }

  /** A summarized/compacted branch's next call sends the saved summary + the
   *  post-summary tail, NOT this raw parent chain — projecting from the full
   *  history would prune/count the wrong context and omit the summary. Detect it
   *  via the live path's `metadata.summaryUsedTokens` marker and fall back (null)
   *  so the client's summary-baseline-aware estimate handles these branches until
   *  a follow-up replays the summary boundary. */
  if (branch.some((message) => (message.metadata?.summaryUsedTokens ?? 0) > 0)) {
    return null;
  }

  const model = params.model;
  const encoding = (model ?? '').toLowerCase().includes('claude') ? 'claude' : 'o200k_base';
  const tokenCounter = await createTokenCounter(encoding);

  const messages: BaseMessage[] = [];
  const indexTokenCountMap: Record<string, number> = {};
  for (let i = 0; i < branch.length; i++) {
    const message = branch[i];
    /** Mirror the live path: prepend quoted excerpts into the user text the model
     *  receives so the gauge counts the same prompt. */
    const hasQuotes =
      message.isCreatedByUser === true &&
      Array.isArray(message.quotes) &&
      message.quotes.length > 0;
    const text = hasQuotes
      ? mergeQuotedText(message.text ?? '', message.quotes ?? [])
      : (message.text ?? '');
    const lcMessage =
      message.isCreatedByUser === true ? new HumanMessage(text) : new AIMessage(text);
    messages.push(lcMessage);
    /** Recount messages with no stored count (imported / pre-feature) rather
     *  than charging 0 — a real 0 and "unknown" must not collapse, or the
     *  snapshot-less histories this endpoint targets would under-report. Also
     *  recount quoted messages: a text-only Save edit leaves a stale text-only
     *  `tokenCount` that omits the quote block, so trust the merged recount. */
    indexTokenCountMap[String(i)] =
      !hasQuotes && message.tokenCount != null && message.tokenCount > 0
        ? message.tokenCount
        : tokenCounter(lcMessage);
  }

  return projectAgentContextUsage({
    agent: {
      agentId: params.agentId ?? 'projection',
      provider: resolveProvider(params.endpoint),
      maxContextTokens,
    },
    messages,
    tokenCounter,
    indexTokenCountMap,
    calibrationRatio: params.calibrationRatio,
  });
}
