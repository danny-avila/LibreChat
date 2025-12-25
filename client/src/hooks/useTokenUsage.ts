import { useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useSetAtom, useAtomValue } from 'jotai';
import { getModelMaxTokens, isAgentsEndpoint } from 'librechat-data-provider';
import type { TMessage } from 'librechat-data-provider';
import { tokenUsageAtom, type TokenUsage } from '~/store/tokenUsage';
import { useGetMessagesByConvoId, useGetAgentByIdQuery } from '~/data-provider';
import { useChatContext } from '~/Providers';

/**
 * Hook to compute and update token usage from conversation messages.
 * Should be called in a component that has access to useChatContext.
 */
export function useTokenUsageComputation() {
  const { conversation } = useChatContext();
  const conversationId = conversation?.conversationId ?? '';
  const setTokenUsage = useSetAtom(tokenUsageAtom);
  const { conversationId: paramId } = useParams();

  // Determine if we need to fetch agent details for token limits
  const endpoint = conversation?.endpoint ?? '';
  const isAgent = isAgentsEndpoint(endpoint);
  const agentId = isAgent ? conversation?.agent_id : null;

  // Fetch full agent details (includes model and provider) when using agents endpoint
  const { data: agent } = useGetAgentByIdQuery(agentId, {
    enabled: !!agentId,
  });

  /**
   * Determine the effective conversation ID for querying messages.
   *
   * Priority logic:
   * 1. If URL param is 'new' -> use 'new' (landing page, no conversation yet)
   * 2. If conversation has actual ID -> use it (active conversation)
   * 3. Fallback to URL param (handles direct navigation to /c/:id)
   *
   * This ensures we always query the correct messages cache key and avoids
   * dual subscriptions that would cause duplicate reactivity and API calls.
   */
  const effectiveConversationId = useMemo(() => {
    if (paramId === 'new') {
      return 'new';
    }
    return conversationId || paramId || '';
  }, [paramId, conversationId]);

  /**
   * Single subscription to messages for the effective conversation ID.
   * React Query caches messages by [QueryKeys.messages, id], so we'll
   * automatically get updates when:
   * - New messages are added via setMessages() in useChatHelpers
   * - Conversation transitions from 'new' to actual ID (cache is synced in setMessages)
   * - Messages are fetched from the server
   */
  const { data: messages } = useGetMessagesByConvoId(effectiveConversationId, {
    enabled: !!effectiveConversationId,
  });

  const effectiveMessages = useMemo<TMessage[]>(() => messages ?? [], [messages]);

  // Compute token usage whenever messages change
  const tokenData = useMemo(() => {
    let inputTokens = 0;
    let outputTokens = 0;

    if (effectiveMessages && Array.isArray(effectiveMessages)) {
      for (const msg of effectiveMessages) {
        const count = msg.tokenCount ?? 0;
        if (msg.isCreatedByUser) {
          inputTokens += count;
        } else {
          outputTokens += count;
        }
      }
    }

    // Determine max context: explicit setting or model default
    let maxContext: number | null = conversation?.maxContextTokens ?? null;

    // If no explicit maxContextTokens, try to look up model default
    if (maxContext === null) {
      // For agents endpoint, get the actual model from the fetched agent
      if (isAgent && agent?.model) {
        // Use agent's provider, or fall back to 'agents' endpoint for lookup
        const provider = agent.provider ?? endpoint;
        const modelDefault = getModelMaxTokens(agent.model, provider);
        if (modelDefault !== undefined) {
          maxContext = modelDefault;
        }
      } else if (conversation?.model) {
        // For other endpoints, use conversation model directly
        const effectiveEndpoint = conversation?.endpointType ?? endpoint;
        const modelDefault = getModelMaxTokens(conversation.model, effectiveEndpoint);
        if (modelDefault !== undefined) {
          maxContext = modelDefault;
        }
      }
    }

    return {
      inputTokens,
      outputTokens,
      maxContext,
    };
  }, [
    effectiveMessages,
    conversation?.maxContextTokens,
    conversation?.model,
    conversation?.endpointType,
    isAgent,
    agent,
    endpoint,
  ]);

  // Update the atom when computed values change
  useEffect(() => {
    setTokenUsage(tokenData);
  }, [tokenData, setTokenUsage]);

  // Reset token usage when starting a new conversation
  useEffect(() => {
    if (paramId === 'new' && effectiveMessages.length === 0) {
      setTokenUsage({
        inputTokens: 0,
        outputTokens: 0,
        maxContext: null,
      });
    }
  }, [paramId, effectiveMessages.length, setTokenUsage]);
}

/**
 * Hook to read the current token usage values.
 */
export function useTokenUsage(): TokenUsage {
  return useAtomValue(tokenUsageAtom);
}

export default useTokenUsage;
