import { logger } from '@librechat/data-schemas';
import { isAgentsEndpoint } from 'librechat-data-provider';
import { labelContentByAgent, getTokenCountForMessage } from '@librechat/agents';
import type { MessageContentComplex } from '@librechat/agents';
import type { Agent, TMessage } from 'librechat-data-provider';
import type { BaseMessage } from '@langchain/core/messages';
import type { ServerRequest } from '~/types';
import Tokenizer from '~/utils/tokenizer';
import { logAxiosError } from '~/utils';

export const omitTitleOptions = new Set([
  'stream',
  'thinking',
  'streaming',
  'clientOptions',
  'thinkingConfig',
  'thinkingBudget',
  'includeThoughts',
  'maxOutputTokens',
  'additionalModelRequestFields',
]);

export function payloadParser({ req, endpoint }: { req: ServerRequest; endpoint: string }) {
  if (isAgentsEndpoint(endpoint)) {
    return;
  }
  return req.body?.endpointOption?.model_parameters;
}

export function createTokenCounter(encoding: Parameters<typeof Tokenizer.getTokenCount>[1]) {
  return function (message: BaseMessage) {
    const countTokens = (text: string) => Tokenizer.getTokenCount(text, encoding);
    return getTokenCountForMessage(message, countTokens);
  };
}

export function logToolError(_graph: unknown, error: unknown, toolId: string) {
  logAxiosError({
    error,
    message: `[api/server/controllers/agents/client.js #chatCompletion] Tool Error "${toolId}"`,
  });
}

const AGENT_SUFFIX_PATTERN = /____(\d+)$/;

/** Finds the primary agent ID within a set of agent IDs (no suffix or lowest suffix number) */
export function findPrimaryAgentId(agentIds: Set<string>): string | null {
  let primaryAgentId: string | null = null;
  let lowestSuffixIndex = Infinity;

  for (const agentId of agentIds) {
    const suffixMatch = agentId.match(AGENT_SUFFIX_PATTERN);
    if (!suffixMatch) {
      return agentId;
    }
    const suffixIndex = parseInt(suffixMatch[1], 10);
    if (suffixIndex < lowestSuffixIndex) {
      lowestSuffixIndex = suffixIndex;
      primaryAgentId = agentId;
    }
  }

  return primaryAgentId;
}

type ContentPart = TMessage['content'] extends (infer U)[] | undefined ? U : never;

/**
 * Creates a mapMethod for getMessagesForConversation that processes agent content.
 * - Strips agentId/groupId metadata from all content
 * - For parallel agents (addedConvo with groupId): filters each group to its primary agent
 * - For handoffs (agentId without groupId): keeps all content from all agents
 * - For multi-agent: applies agent labels to content
 *
 * The key distinction:
 * - Parallel execution (addedConvo): Parts have both agentId AND groupId
 * - Handoffs: Parts only have agentId, no groupId
 */
export function createMultiAgentMapper(primaryAgent: Agent, agentConfigs?: Map<string, Agent>) {
  const hasMultipleAgents = (primaryAgent.edges?.length ?? 0) > 0 || (agentConfigs?.size ?? 0) > 0;

  let agentNames: Record<string, string> | null = null;
  if (hasMultipleAgents) {
    agentNames = { [primaryAgent.id]: primaryAgent.name || 'Assistant' };
    if (agentConfigs) {
      for (const [agentId, agentConfig] of agentConfigs.entries()) {
        agentNames[agentId] = agentConfig.name || agentConfig.id;
      }
    }
  }

  return (message: TMessage): TMessage => {
    if (message.isCreatedByUser || !Array.isArray(message.content)) {
      return message;
    }

    const hasAgentMetadata = message.content.some(
      (part) =>
        (part as ContentPart & { agentId?: string; groupId?: number })?.agentId ||
        (part as ContentPart & { groupId?: number })?.groupId != null,
    );
    if (!hasAgentMetadata) {
      return message;
    }

    try {
      const groupAgentMap = new Map<number, Set<string>>();

      for (const part of message.content) {
        const p = part as ContentPart & { agentId?: string; groupId?: number };
        const groupId = p?.groupId;
        const agentId = p?.agentId;
        if (groupId != null && agentId) {
          if (!groupAgentMap.has(groupId)) {
            groupAgentMap.set(groupId, new Set());
          }
          groupAgentMap.get(groupId)!.add(agentId);
        }
      }

      const groupPrimaryMap = new Map<number, string>();
      for (const [groupId, agentIds] of groupAgentMap) {
        const primary = findPrimaryAgentId(agentIds);
        if (primary) {
          groupPrimaryMap.set(groupId, primary);
        }
      }

      const filteredContent: ContentPart[] = [];
      const agentIdMap: Record<number, string> = {};

      for (const part of message.content) {
        const p = part as ContentPart & { agentId?: string; groupId?: number };
        const agentId = p?.agentId;
        const groupId = p?.groupId;

        const isParallelPart = groupId != null;
        const groupPrimary = isParallelPart ? groupPrimaryMap.get(groupId) : null;
        const shouldInclude = !isParallelPart || !agentId || agentId === groupPrimary;

        if (shouldInclude) {
          const newIndex = filteredContent.length;
          const { agentId: _a, groupId: _g, ...cleanPart } = p;
          filteredContent.push(cleanPart as ContentPart);
          if (agentId && hasMultipleAgents) {
            agentIdMap[newIndex] = agentId;
          }
        }
      }

      const finalContent =
        Object.keys(agentIdMap).length > 0 && agentNames
          ? labelContentByAgent(filteredContent as MessageContentComplex[], agentIdMap, agentNames)
          : filteredContent;

      return { ...message, content: finalContent as TMessage['content'] };
    } catch (error) {
      logger.error('[AgentClient] Error processing multi-agent message:', error);
      return message;
    }
  };
}
