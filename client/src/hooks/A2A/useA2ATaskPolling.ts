import { useEffect, useRef } from 'react';
import { v4 } from 'uuid';
import { useQueryClient } from '@tanstack/react-query';
import { QueryKeys } from 'librechat-data-provider';
import type { TMessage } from 'librechat-data-provider';

type StartParams = {
  taskId: string;
  agentId: string;
  conversationId?: string | null;
  getMessages: () => TMessage[] | undefined;
  setMessages: (messages: TMessage[]) => void;
};

// Polls A2A task status and triggers UI to refetch server-saved messages.
// We intentionally avoid injecting local placeholder messages because
// server decides authoritative parentMessageId, preventing mid-task forks.
export default function useA2ATaskPolling() {
  const queryClient = useQueryClient();
  const cancelRef = useRef<boolean>(false);
  const timerRef = useRef<number | null>(null);
  const backoffRef = useRef<number>(3000);
  const lastStateRef = useRef<Record<string, { status?: string; statusMessage?: string; messageId?: string }>>({});

  // Stop polling loop and reset backoff.
  const stop = () => {
    cancelRef.current = true;
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    backoffRef.current = 3000;
  };

  const start = ({ taskId, agentId, conversationId, getMessages, setMessages }: StartParams) => {
    stop();
    cancelRef.current = false;
    lastStateRef.current[taskId] = {};

    const poll = async () => {
      if (cancelRef.current) {
        return;
      }
      try {
        const res = await fetch(
          `/api/a2a/tasks/${encodeURIComponent(taskId)}/status?agentId=${encodeURIComponent(agentId)}`,
          {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
          },
        );
        if (res.ok) {
          const json = await res.json();
          const status = json?.task?.status as string | undefined;
          const statusMessage = json?.task?.statusMessage as string | undefined;
          if (status) {
            const statusText = `Task ${taskId}: ${status}${statusMessage ? ` — ${statusMessage}` : ''}`;
            const current = getMessages() ?? [];
            const last = lastStateRef.current[taskId];
            const changed = !last || last.status !== status || last.statusMessage !== statusMessage;

            if (changed) {
              //Append a lightweight local placeholder
              // so the user sees progress immediately; server-saved messages will
              // normalize on completion/refresh.
              const parentId = current.length ? current[current.length - 1].messageId : null;
              const messageId = v4();
              const statusMsg: TMessage = {
                messageId,
                conversationId: (conversationId as string) ?? null,
                parentMessageId: parentId,
                role: 'assistant',
                text: statusText,
                isCreatedByUser: false,
              } as TMessage;
              const next = [...current, statusMsg];
              setMessages(next);
              if (conversationId) {
                queryClient.setQueryData<TMessage[]>([QueryKeys.messages, conversationId], next);
              }
              lastStateRef.current[taskId] = { status, statusMessage, messageId };
            }

            if (status === 'completed' || status === 'failed' || status === 'canceled') {
              if (conversationId) {
                queryClient.invalidateQueries({ queryKey: [QueryKeys.messages, conversationId] });
              }
              stop();
              return;
            }
          }
        }
      } catch (_e) {
        // ignore transient errors
      }

      const delay = Math.min(backoffRef.current, 30000);
      backoffRef.current = Math.min(delay * 2, 30000);
      timerRef.current = window.setTimeout(poll, delay);
    };

    timerRef.current = window.setTimeout(poll, 0);
  };

  return { start, stop };
}


// Optional: stop polling on full page unload to avoid orphaned loops.
export function useA2APollingOnUnload() {
  const cancelRef = useRef<() => void>();
  const attach = (stop: () => void) => (cancelRef.current = stop);
  useEffect(() => {
    const onBeforeUnload = () => {
      try {
        cancelRef.current?.();
      } catch {}
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeunload);
  }, []);
  return { attach };
}
// Small helper to wire A2A polling from a final SSE event.
// Keeps A2A logic out of the generic useSSE hook.
export function startPollingFromFinalEvent(
  a2a:
    | {
        start: (args: {
          taskId: string;
          agentId: string;
          conversationId?: string | null;
          getMessages: () => TMessage[] | undefined;
          setMessages: (messages: TMessage[]) => void;
        }) => void;
      }
    | null,
  data: any,
  getMessages: () => TMessage[] | undefined,
  setMessages: (messages: TMessage[]) => void,
) {
  try {
    const endpoint = data?.responseMessage?.endpoint as string | undefined;
    const taskId = data?.responseMessage?.metadata?.taskId as string | undefined;
    const agentId = data?.responseMessage?.metadata?.agentId as string | undefined;
    const conversationId = data?.conversation?.conversationId as string | undefined;

    if (a2a && endpoint === 'a2a' && taskId && agentId) {
      a2a.start({ taskId, agentId, conversationId, getMessages, setMessages });
    }
  } catch (_e) {
    // no-op
  }
}
