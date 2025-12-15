import { useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useSetAtom, useAtomValue } from 'jotai';
import { getModelMaxTokens } from 'librechat-data-provider';
import type { TMessage } from 'librechat-data-provider';
import { tokenUsageAtom, type TokenUsage } from '~/store/tokenUsage';
import { useGetMessagesByConvoId } from '~/data-provider';
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

  // Determine the query key to use - same logic as useChatHelpers
  const queryParam = paramId === 'new' ? paramId : conversationId || paramId || '';

  // Use the query hook to get reactive messages
  // Subscribe to both the paramId-based key and conversationId-based key
  const { data: messages } = useGetMessagesByConvoId(queryParam, {
    enabled: !!queryParam,
  });

  // Also subscribe to the actual conversationId if different from queryParam
  // This ensures we get updates when conversation transitions from 'new' to actual ID
  const { data: messagesById } = useGetMessagesByConvoId(conversationId, {
    enabled: !!conversationId && conversationId !== 'new' && conversationId !== queryParam,
  });

  // Use whichever has more messages (handles transition from new -> actual ID)
  const effectiveMessages = useMemo(() => {
    const msgArray = messages ?? [];
    const msgByIdArray = messagesById ?? [];
    return msgByIdArray.length > msgArray.length ? msgByIdArray : msgArray;
  }, [messages, messagesById]);

  // Compute token usage whenever messages change
  const tokenData = useMemo(() => {
    let inputTokens = 0;
    let outputTokens = 0;

    if (effectiveMessages && Array.isArray(effectiveMessages)) {
      for (const msg of effectiveMessages as TMessage[]) {
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
    if (maxContext === null && conversation?.model) {
      const endpoint = conversation.endpointType ?? conversation.endpoint ?? '';
      const modelDefault = getModelMaxTokens(conversation.model, endpoint);
      if (modelDefault !== undefined) {
        maxContext = modelDefault;
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
    conversation?.endpoint,
    conversation?.endpointType,
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
