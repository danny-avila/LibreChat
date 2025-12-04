import { useEffect, useState, useRef } from 'react';
import { SSE } from 'sse.js';
import { useSetRecoilState, useRecoilValue } from 'recoil';
import { request } from 'librechat-data-provider';
import type { TMessage, EventSubmission } from 'librechat-data-provider';
import type { EventHandlerParams } from './useEventHandlers';
import { useAuthContext } from '~/hooks/AuthContext';
import { useGetStartupConfig, useGetUserBalance } from '~/data-provider';
import useEventHandlers from './useEventHandlers';
import store from '~/store';

type ChatHelpers = Pick<
  EventHandlerParams,
  | 'setMessages'
  | 'getMessages'
  | 'setConversation'
  | 'setIsSubmitting'
  | 'newConversation'
  | 'resetLatestMessage'
>;

/**
 * Hook to resume streaming if navigating back to a conversation with active generation.
 * Checks for active jobs on mount and auto-subscribes if found.
 */
export default function useResumeOnLoad(
  conversationId: string | undefined,
  chatHelpers: ChatHelpers,
  runIndex = 0,
) {
  const resumableEnabled = useRecoilValue(store.resumableStreams);
  const { token, isAuthenticated } = useAuthContext();
  const sseRef = useRef<SSE | null>(null);
  const checkedConvoRef = useRef<string | null>(null);
  const [completed, setCompleted] = useState(new Set());
  const setAbortScroll = useSetRecoilState(store.abortScrollFamily(runIndex));
  const setShowStopButton = useSetRecoilState(store.showStopButtonByIndex(runIndex));

  const { getMessages, setIsSubmitting } = chatHelpers;

  const { stepHandler, finalHandler, contentHandler } = useEventHandlers({
    ...chatHelpers,
    setCompleted,
    setShowStopButton,
  });

  const { data: startupConfig } = useGetStartupConfig();
  const balanceQuery = useGetUserBalance({
    enabled: !!isAuthenticated && startupConfig?.balance?.enabled,
  });

  /**
   * Check for active job when conversation loads
   */
  useEffect(() => {
    if (!resumableEnabled || !conversationId || !token) {
      checkedConvoRef.current = null;
      return;
    }

    // Only check once per conversationId to prevent loops
    if (checkedConvoRef.current === conversationId) {
      return;
    }

    checkedConvoRef.current = conversationId;

    const checkAndResume = async () => {
      try {
        const response = await fetch(`/api/agents/chat/status/${conversationId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!response.ok) {
          return;
        }

        const { active, streamId } = await response.json();

        if (!active || !streamId) {
          return;
        }

        console.log('[ResumeOnLoad] Found active job, resuming...', { streamId });

        const messages = getMessages() || [];
        const lastMessage = messages[messages.length - 1];
        let textIndex: number | null = null;

        const url = `/api/agents/chat/stream/${encodeURIComponent(streamId)}`;

        const sse = new SSE(url, {
          headers: { Authorization: `Bearer ${token}` },
          method: 'GET',
        });
        sseRef.current = sse;

        sse.addEventListener('open', () => {
          console.log('[ResumeOnLoad] Reconnected to stream');
          setAbortScroll(false);
          setShowStopButton(true);
          setIsSubmitting(true);
        });

        sse.addEventListener('message', (e: MessageEvent) => {
          try {
            const data = JSON.parse(e.data);

            if (data.final != null) {
              try {
                finalHandler(data, { messages } as unknown as EventSubmission);
              } catch (error) {
                console.error('[ResumeOnLoad] Error in finalHandler:', error);
                setIsSubmitting(false);
                setShowStopButton(false);
              }
              (startupConfig?.balance?.enabled ?? false) && balanceQuery.refetch();
              sse.close();
              sseRef.current = null;
              return;
            }

            if (data.event != null) {
              stepHandler(data, {
                messages,
                userMessage: lastMessage,
              } as unknown as EventSubmission);
              return;
            }

            if (data.type != null) {
              const { text, index } = data;
              if (text != null && index !== textIndex) {
                textIndex = index;
              }
              contentHandler({ data, submission: { messages } as unknown as EventSubmission });
              return;
            }
          } catch (error) {
            console.error('[ResumeOnLoad] Error processing message:', error);
          }
        });

        sse.addEventListener('error', async (e: MessageEvent) => {
          console.log('[ResumeOnLoad] Stream error');
          sse.close();
          sseRef.current = null;
          setIsSubmitting(false);
          setShowStopButton(false);

          /* @ts-ignore */
          if (e.responseCode === 401) {
            try {
              const refreshResponse = await request.refreshToken();
              const newToken = refreshResponse?.token ?? '';
              if (newToken) {
                request.dispatchTokenUpdatedEvent(newToken);
              }
            } catch (error) {
              console.log('[ResumeOnLoad] Token refresh failed:', error);
            }
          }
        });

        sse.stream();
      } catch (error) {
        console.error('[ResumeOnLoad] Error checking job status:', error);
      }
    };

    checkAndResume();

    return () => {
      if (sseRef.current) {
        sseRef.current.close();
        sseRef.current = null;
      }
    };
    // Only re-run when conversationId changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);
}
