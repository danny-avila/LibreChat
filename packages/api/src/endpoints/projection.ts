import { HumanMessage, AIMessage } from '@langchain/core/messages';
import { Providers, createTokenCounter, projectAgentContextUsage } from '@librechat/agents';
import type { BaseMessage } from '@langchain/core/messages';
import type { TContextProjectionRequest, TContextUsageEvent } from 'librechat-data-provider';

interface ProjectionMessage {
  messageId: string;
  parentMessageId?: string | null;
  tokenCount?: number;
  summaryTokenCount?: number;
  isCreatedByUser?: boolean;
  text?: string;
}

interface ProjectionAgent {
  instructions?: string;
  provider?: string;
  model?: string;
  model_parameters?: { maxContextTokens?: number };
}

export interface ContextProjectionDeps {
  /** Authenticated requester — branch lookups are scoped to this user. */
  userId?: string;
  getMessages: (
    filter: { conversationId: string; user?: string },
    select?: string,
  ) => Promise<ProjectionMessage[]>;
  getAgent: (filter: { id: string }) => Promise<ProjectionAgent | null>;
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
 * Server-side context-usage projection: reconstructs the viewed branch + the
 * resolved agent config and asks the agents SDK what the next call's context
 * would be, WITHOUT invoking the model. Reuses LibreChat's already-calibrated
 * per-message `tokenCount`s (no re-tokenizing). Returns null when there is no
 * resolvable context window. NOTE: this first cut targets message-windowing
 * accuracy — tool-schema tokens are not yet included; a follow-up will reuse the
 * full `initializeAgent` path for exact instruction/tool overhead.
 */
export async function resolveContextProjection(
  deps: ContextProjectionDeps,
  params: TContextProjectionRequest,
): Promise<TContextUsageEvent | null> {
  const stored = await deps.getMessages(
    { conversationId: params.conversationId, user: deps.userId },
    'messageId parentMessageId tokenCount summaryTokenCount isCreatedByUser text',
  );
  const branch = resolveBranch(stored, params.messageId);
  if (branch.length === 0) {
    return null;
  }

  /** A summarized/compacted branch's next call sends the saved summary + the
   *  post-summary tail, NOT this raw parent chain — projecting from the full
   *  history would prune/count the wrong context and omit the summary. Until the
   *  follow-up replays the summary boundary, fall back (null) so the client's
   *  summary-baseline-aware estimate handles these branches. */
  if (branch.some((message) => (message.summaryTokenCount ?? 0) > 0)) {
    return null;
  }

  let instructions: string | undefined;
  let providerValue: string | undefined = params.endpoint;
  let model = params.model;
  let maxContextTokens = params.maxContextTokens;
  if (params.agentId != null && params.agentId !== '') {
    const agent = await deps.getAgent({ id: params.agentId });
    if (agent != null) {
      instructions = agent.instructions;
      providerValue = agent.provider ?? providerValue;
      model = agent.model ?? model;
      maxContextTokens = maxContextTokens ?? agent.model_parameters?.maxContextTokens;
    }
  }
  if (maxContextTokens == null || maxContextTokens <= 0) {
    return null;
  }

  const encoding = (model ?? '').toLowerCase().includes('claude') ? 'claude' : 'o200k_base';
  const tokenCounter = await createTokenCounter(encoding);

  const messages: BaseMessage[] = [];
  const indexTokenCountMap: Record<string, number> = {};
  for (let i = 0; i < branch.length; i++) {
    const message = branch[i];
    const text = message.text ?? '';
    const lcMessage =
      message.isCreatedByUser === true ? new HumanMessage(text) : new AIMessage(text);
    messages.push(lcMessage);
    /** Recount messages with no stored count (imported / pre-feature) rather
     *  than charging 0 — a real 0 and "unknown" must not collapse, or the
     *  snapshot-less histories this endpoint targets would under-report. */
    indexTokenCountMap[String(i)] =
      message.tokenCount != null && message.tokenCount > 0
        ? message.tokenCount
        : tokenCounter(lcMessage);
  }

  return projectAgentContextUsage({
    agent: {
      agentId: params.agentId ?? 'projection',
      provider: resolveProvider(providerValue),
      instructions,
      maxContextTokens,
    },
    messages,
    tokenCounter,
    indexTokenCountMap,
    calibrationRatio: params.calibrationRatio,
  });
}
