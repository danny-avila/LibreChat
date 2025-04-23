import { useCallback, useRef } from 'react';
import { useSearchParams, useLocation } from 'react-router-dom';
import type { TConversation } from 'librechat-data-provider';

export const useUpdateSearchParams = () => {
  const lastParamsRef = useRef<Record<string, string>>({});
  const [, setSearchParams] = useSearchParams();
  const location = useLocation();

  const updateSearchParams = useCallback(
    (conversation: TConversation) => {
      // Only update search params when we're on a new conversation route
      if (location.pathname !== '/c/new') {
        return;
      }

      setSearchParams(
        (params) => {
          const currentParams = Object.fromEntries(params.entries());
          const newSearchParams = conversationToSearchParams(conversation);
          const newParams = Object.fromEntries(newSearchParams.entries());

          if (JSON.stringify(lastParamsRef.current) === JSON.stringify(newParams)) {
            return currentParams;
          }

          lastParamsRef.current = { ...newParams };
          return newParams;
        },
        { replace: true },
      );
    },
    [setSearchParams, location.pathname],
  );

  return updateSearchParams;
};

// Utility function to convert conversation parameters to URL search params
export function conversationToSearchParams(conversation: TConversation): URLSearchParams {
  const params = new URLSearchParams();

  if (conversation.endpoint) {
    params.set('endpoint', conversation.endpoint);
  }
  if (conversation.model) {
    params.set('model', conversation.model);
  }

  if (conversation.agent_id) {
    params.set('agent_id', String(conversation.agent_id));
    return params;
  }
  if (conversation.assistant_id) {
    params.set('assistant_id', String(conversation.assistant_id));
    return params;
  }

  const paramMap = {
    temperature: conversation.temperature,
    presence_penalty: conversation.presence_penalty,
    frequency_penalty: conversation.frequency_penalty,
    stop: conversation.stop,
    top_p: conversation.top_p,
    max_tokens: conversation.max_tokens,
    topP: conversation.topP,
    topK: conversation.topK,
    maxOutputTokens: conversation.maxOutputTokens,
    promptCache: conversation.promptCache,
    region: conversation.region,
    maxTokens: conversation.maxTokens,
  };

  Object.entries(paramMap).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      if (Array.isArray(value)) {
        if (key === 'stop') {
          params.set(key, value.join(','));
        } else {
          params.set(key, JSON.stringify(value));
        }
      } else {
        params.set(key, String(value));
      }
    }
  });

  return params;
}

export default useUpdateSearchParams;
