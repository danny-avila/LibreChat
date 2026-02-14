import { useRef, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useSetAtom, useAtomValue } from 'jotai';
import { isAgentsEndpoint, getModelMaxTokens } from 'librechat-data-provider';
import type { TMessage } from 'librechat-data-provider';
import { useGetMessagesByConvoId, useGetAgentByIdQuery } from '~/data-provider';
import { tokenUsageAtom, type TokenUsage } from '~/store/tokenUsage';
import { useChatContext } from '~/Providers';

/**
 * Hook to compute and update token usage from conversation messages.
 * Should be called in a component that has access to useChatContext.
 *
 * Token summation is incremental: we track how many messages have been processed
 * and only scan new ones. When the conversation changes or messages reset, we
 * recompute from scratch. This avoids O(n) re-scans of the full message array
 * on every new message.
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
   */
  const effectiveConversationId = useMemo(() => {
    if (paramId === 'new') {
      return 'new';
    }
    return conversationId || paramId || '';
  }, [paramId, conversationId]);

  const { data: messages } = useGetMessagesByConvoId(effectiveConversationId, {
    enabled: !!effectiveConversationId,
  });

  /**
   * Incremental token tracking.
   * We keep running totals and the index of the last processed message.
   * If the message array shrinks (conversation switch) or the conversation ID
   * changes, we reset and recompute.
   */
  const tokenRef = useRef({
    convoId: '',
    processedCount: 0,
    inputTokens: 0,
    outputTokens: 0,
  });

  const tokenTotals = useMemo(() => {
    const msgArray = messages ?? [];
    const ref = tokenRef.current;

    // Reset if conversation changed or messages were replaced (e.g. conversation switch)
    if (ref.convoId !== effectiveConversationId || msgArray.length < ref.processedCount) {
      ref.convoId = effectiveConversationId;
      ref.processedCount = 0;
      ref.inputTokens = 0;
      ref.outputTokens = 0;
    }

    // Process only new messages since last computation
    for (let i = ref.processedCount; i < msgArray.length; i++) {
      const msg: TMessage = msgArray[i];
      const count = msg.tokenCount ?? 0;
      if (msg.isCreatedByUser) {
        ref.inputTokens += count;
      } else {
        ref.outputTokens += count;
      }
    }
    ref.processedCount = msgArray.length;

    return { inputTokens: ref.inputTokens, outputTokens: ref.outputTokens };
  }, [messages, effectiveConversationId]);

  // Compute max context separately (different dependencies, no message iteration)
  const maxContext = useMemo(() => {
    let ctx: number | null = conversation?.maxContextTokens ?? null;

    if (ctx === null) {
      if (isAgent && agent?.model) {
        const provider = agent.provider ?? endpoint;
        const modelDefault = getModelMaxTokens(agent.model, provider);
        if (modelDefault !== undefined) {
          ctx = modelDefault;
        }
      } else if (conversation?.model) {
        const effectiveEndpoint = conversation?.endpointType ?? endpoint;
        const modelDefault = getModelMaxTokens(conversation.model, effectiveEndpoint);
        if (modelDefault !== undefined) {
          ctx = modelDefault;
        }
      }
    }

    return ctx;
  }, [
    conversation?.maxContextTokens,
    conversation?.model,
    conversation?.endpointType,
    isAgent,
    agent,
    endpoint,
  ]);

  // Update the atom when computed values change
  useEffect(() => {
    setTokenUsage({
      inputTokens: tokenTotals.inputTokens,
      outputTokens: tokenTotals.outputTokens,
      maxContext,
    });
  }, [tokenTotals, maxContext, setTokenUsage]);

  // Reset token usage when starting a new conversation
  useEffect(() => {
    const msgCount = messages?.length ?? 0;
    if (paramId === 'new' && msgCount === 0) {
      setTokenUsage({
        inputTokens: 0,
        outputTokens: 0,
        maxContext: null,
      });
    }
  }, [paramId, messages, setTokenUsage]);
}

/**
 * Hook to read the current token usage values.
 */
export function useTokenUsage(): TokenUsage {
  return useAtomValue(tokenUsageAtom);
}

export default useTokenUsage;
