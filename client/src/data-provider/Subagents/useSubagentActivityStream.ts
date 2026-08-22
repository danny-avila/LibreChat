import { useEffect } from 'react';
import { SSE } from 'sse.js';
import { useSetRecoilState } from 'recoil';
import { useQueryClient } from '@tanstack/react-query';
import { QueryKeys, StepEvents, apiBaseUrl } from 'librechat-data-provider';
import type { SubagentUpdateEvent } from 'librechat-data-provider';
import type { ActiveSubagentPanel } from '~/store/subagents';
import {
  reduceSubagentProgress,
  subagentProgressByToolCallId,
  subagentProgressKey,
} from '~/store/subagents';
import { useAuthContext } from '~/hooks/AuthContext';

type ActivityEnvelope = {
  event?: unknown;
  data?: unknown;
  final?: unknown;
  subagentActivity?: unknown;
};

const isSubagentUpdate = (value: unknown): value is SubagentUpdateEvent => {
  if (value == null || typeof value !== 'object') return false;
  const event = value as Partial<SubagentUpdateEvent>;
  return (
    typeof event.subagentRunId === 'string' &&
    typeof event.subagentType === 'string' &&
    typeof event.parentToolCallId === 'string' &&
    typeof event.phase === 'string'
  );
};

/** Live-only enhancement for the selected durable child; the durable query remains canonical. */
export default function useSubagentActivityStream(
  selection: ActiveSubagentPanel,
  enabled = true,
): void {
  const { token, isAuthenticated } = useAuthContext();
  const queryClient = useQueryClient();
  const key = subagentProgressKey(
    selection.parentMessageId,
    selection.toolCallId,
    selection.partIndex,
  );
  const setProgress = useSetRecoilState(subagentProgressByToolCallId(key));
  const durable = selection.durable;

  useEffect(() => {
    if (
      selection.host !== 'conversation' ||
      durable == null ||
      !enabled ||
      !isAuthenticated ||
      token == null
    ) {
      return;
    }

    const queryKey = [
      QueryKeys.subagentThread,
      selection.parentConversationId,
      durable.threadId,
      durable.taskId,
    ];
    const endpoint = `${apiBaseUrl()}/api/convos/${encodeURIComponent(selection.parentConversationId)}/subagents/${encodeURIComponent(durable.threadId)}/tasks/${encodeURIComponent(durable.taskId)}/activity`;
    const stream = new SSE(endpoint, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      stream.close();
    };

    stream.addEventListener('message', (message: MessageEvent) => {
      let envelope: ActivityEnvelope;
      try {
        envelope = JSON.parse(message.data) as ActivityEnvelope;
      } catch {
        return;
      }
      if (envelope.final === true && envelope.subagentActivity === true) {
        close();
        void queryClient.invalidateQueries(queryKey);
        return;
      }
      const event = envelope.data;
      if (envelope.event !== StepEvents.ON_SUBAGENT_UPDATE || !isSubagentUpdate(event)) {
        return;
      }
      if (event.parentToolCallId !== selection.toolCallId) return;
      setProgress((previous) => reduceSubagentProgress(previous, [event]));
    });
    stream.addEventListener('error', close);

    return close;
  }, [
    durable,
    enabled,
    isAuthenticated,
    queryClient,
    selection.host,
    selection.parentConversationId,
    selection.toolCallId,
    setProgress,
    token,
  ]);
}
