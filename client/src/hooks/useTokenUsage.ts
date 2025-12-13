import { useEffect, useMemo } from 'react';
import { useSetAtom, useAtomValue } from 'jotai';
import type { TMessage } from 'librechat-data-provider';
import { getModelMaxTokens } from 'librechat-data-provider';
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

  // Use the query hook to get reactive messages
  const { data: messages } = useGetMessagesByConvoId(conversationId, {
    enabled: !!conversationId && conversationId !== 'new',
  });

  // Compute token usage whenever messages change
  const tokenData = useMemo(() => {
    let inputTokens = 0;
    let outputTokens = 0;

    if (messages && Array.isArray(messages)) {
      for (const msg of messages as TMessage[]) {
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
    messages,
    conversation?.maxContextTokens,
    conversation?.model,
    conversation?.endpoint,
    conversation?.endpointType,
  ]);

  // Update the atom when computed values change
  useEffect(() => {
    setTokenUsage(tokenData);
  }, [tokenData, setTokenUsage]);
}

/**
 * Hook to read the current token usage values.
 */
export function useTokenUsage(): TokenUsage {
  return useAtomValue(tokenUsageAtom);
}

export default useTokenUsage;
