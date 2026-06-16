import { HumanMessage, AIMessage } from '@langchain/core/messages';
import { Providers, createTokenCounter, projectAgentContextUsage } from '@librechat/agents';
import type { BaseMessage } from '@langchain/core/messages';
import type { TContextProjectionRequest, TContextUsageEvent } from 'librechat-data-provider';

interface ProjectionMessage {
  messageId: string;
  parentMessageId?: string | null;
  tokenCount?: number;
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
  getMessages: (
    filter: { conversationId: string },
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
    { conversationId: params.conversationId },
    'messageId parentMessageId tokenCount isCreatedByUser text',
  );
  const branch = resolveBranch(stored, params.messageId);
  if (branch.length === 0) {
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

  const messages: BaseMessage[] = [];
  const indexTokenCountMap: Record<string, number> = {};
  for (let i = 0; i < branch.length; i++) {
    const message = branch[i];
    const text = message.text ?? '';
    messages.push(message.isCreatedByUser === true ? new HumanMessage(text) : new AIMessage(text));
    indexTokenCountMap[String(i)] = message.tokenCount ?? 0;
  }

  const encoding = (model ?? '').toLowerCase().includes('claude') ? 'claude' : 'o200k_base';
  const tokenCounter = await createTokenCounter(encoding);

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
