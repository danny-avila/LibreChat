import { useEffect, useLayoutEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Constants, QueryKeys, dataService } from 'librechat-data-provider';
import type { TMessage } from 'librechat-data-provider';
import { fetchStreamStatus, streamStatusQueryKey, useStreamStatus } from '~/data-provider';
import { isNotFoundError, removeConvoFromAllQueries } from '~/utils';

const MESSAGE_RECHECK_DELAY_MS = 1_000;

type MissingConversationRecoveryParams = {
  conversationId?: string;
  enabled: boolean;
  onConfirmedMissing: () => void;
};

export default function useMissingConversationRecovery({
  conversationId,
  enabled,
  onConfirmedMissing,
}: MissingConversationRecoveryParams) {
  const queryClient = useQueryClient();
  const onConfirmedMissingRef = useRef(onConfirmedMissing);
  const { data: streamStatus, isFetching, isSuccess } = useStreamStatus(conversationId, enabled);

  useLayoutEffect(() => {
    onConfirmedMissingRef.current = onConfirmedMissing;
  }, [onConfirmedMissing]);

  useEffect(() => {
    if (
      !enabled ||
      !conversationId ||
      conversationId === Constants.NEW_CONVO ||
      !isSuccess ||
      isFetching ||
      streamStatus?.active !== false
    ) {
      return;
    }

    let cancelled = false;
    const timeout = setTimeout(() => {
      void (async () => {
        try {
          const messages = await dataService.getMessagesByConvoId(conversationId);
          if (!cancelled) {
            queryClient.setQueryData<TMessage[]>([QueryKeys.messages, conversationId], messages);
          }
          return;
        } catch (error) {
          if (cancelled || !isNotFoundError(error)) {
            return;
          }
        }

        let verifiedStatus;
        try {
          verifiedStatus = await fetchStreamStatus(conversationId);
        } catch {
          return;
        }
        if (cancelled) {
          return;
        }

        queryClient.setQueryData(streamStatusQueryKey(conversationId), verifiedStatus);
        if (verifiedStatus.active) {
          return;
        }

        removeConvoFromAllQueries(queryClient, conversationId);
        queryClient.removeQueries({ queryKey: [QueryKeys.conversation, conversationId] });
        queryClient.removeQueries({ queryKey: [QueryKeys.messages, conversationId] });
        queryClient.setQueryData<TMessage[]>([QueryKeys.messages, Constants.NEW_CONVO], []);
        onConfirmedMissingRef.current();
      })();
    }, MESSAGE_RECHECK_DELAY_MS);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [conversationId, enabled, isFetching, isSuccess, queryClient, streamStatus?.active]);
}
