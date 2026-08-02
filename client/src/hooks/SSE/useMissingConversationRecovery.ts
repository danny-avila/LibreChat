import { useEffect, useLayoutEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Constants, QueryKeys, dataService } from 'librechat-data-provider';
import type { TMessage } from 'librechat-data-provider';
import {
  fetchStreamStatus,
  getGenerationProtocolVersion,
  streamStatusQueryKey,
  useStreamStatus,
} from '~/data-provider';
import useSteerConvert from '~/hooks/Chat/useSteerConvert';
import { dedupeSteersById, isNotFoundError, removeConvoFromAllQueries } from '~/utils';

const MESSAGE_RECHECK_DELAY_MS = 1_000;
const SERVER_NOT_READY_CODE = 'SERVER_NOT_READY';

const isServerNotReadyError = (error: unknown): boolean => {
  const response = (error as { response?: { status?: number; data?: unknown } } | null)?.response;
  const data = response?.data;
  return (
    response?.status === 503 &&
    data != null &&
    typeof data === 'object' &&
    (data as { code?: unknown }).code === SERVER_NOT_READY_CODE
  );
};

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
  const convertSteersToQueued = useSteerConvert();
  const onConfirmedMissingRef = useRef(onConfirmedMissing);
  const {
    data: streamStatus,
    error: streamStatusError,
    isFetching,
    isSuccess,
    refetch: refetchStreamStatus,
  } = useStreamStatus(conversationId, enabled);
  const streamStatusRef = useRef(streamStatus);
  const recoveringConversationRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    onConfirmedMissingRef.current = onConfirmedMissing;
  }, [onConfirmedMissing]);

  useLayoutEffect(() => {
    streamStatusRef.current = streamStatus;
  }, [streamStatus]);

  useEffect(() => {
    if (!enabled || !conversationId || conversationId === Constants.NEW_CONVO) {
      recoveringConversationRef.current = null;
      return;
    }
    if (isFetching) {
      return;
    }
    if (!isSuccess) {
      if (!isServerNotReadyError(streamStatusError)) {
        return;
      }
      const timeout = setTimeout(() => {
        void refetchStreamStatus();
      }, MESSAGE_RECHECK_DELAY_MS);
      return () => clearTimeout(timeout);
    }
    if (streamStatus == null) {
      return;
    }
    if (streamStatus?.active === true) {
      if (
        recoveringConversationRef.current === conversationId &&
        streamStatus.generationHandoff !== true
      ) {
        queryClient.setQueryData(streamStatusQueryKey(conversationId), {
          ...streamStatus,
          generationHandoff: true,
        });
      }
      recoveringConversationRef.current = null;
      return;
    }
    if (streamStatus?.active !== false) {
      return;
    }

    recoveringConversationRef.current = conversationId;
    let cancelled = false;
    const initialStatus = streamStatusRef.current;
    const timeout = setTimeout(() => {
      void (async () => {
        let recoveredMessages: TMessage[] | null = null;
        try {
          recoveredMessages = await dataService.getMessagesByConvoId(conversationId);
        } catch (error) {
          if (cancelled || !isNotFoundError(error)) {
            return;
          }
        }

        let verifiedStatus;
        try {
          verifiedStatus = await fetchStreamStatus(conversationId);
        } catch {
          if (!cancelled && recoveredMessages != null) {
            queryClient.setQueryData<TMessage[]>(
              [QueryKeys.messages, conversationId],
              recoveredMessages,
            );
          }
          return;
        }
        if (cancelled) {
          // A legacy status read destructively claims these steers. Preserve
          // their words even though the abandoned view must receive no updates.
          const claimedSteers = dedupeSteersById(verifiedStatus.unrecoveredSteers);
          if (claimedSteers.length > 0) {
            convertSteersToQueued(conversationId, claimedSteers, {
              generationProtocolVersion: getGenerationProtocolVersion(verifiedStatus),
            });
          }
          return;
        }

        if (recoveredMessages != null) {
          queryClient.setQueryData<TMessage[]>(
            [QueryKeys.messages, conversationId],
            recoveredMessages,
          );
        }
        queryClient.setQueryData(
          streamStatusQueryKey(conversationId),
          verifiedStatus.active
            ? {
                ...verifiedStatus,
                generationHandoff: true,
              }
            : verifiedStatus,
        );
        if (verifiedStatus.active) {
          recoveringConversationRef.current = null;
          return;
        }

        const leftoverSteers = dedupeSteersById(
          initialStatus?.unrecoveredSteers,
          initialStatus?.resumeState?.pendingSteers,
          verifiedStatus.unrecoveredSteers,
          verifiedStatus.resumeState?.pendingSteers,
        );
        if (leftoverSteers.length > 0) {
          const generationStatus =
            verifiedStatus.generationProtocolVersion == null ? initialStatus : verifiedStatus;
          convertSteersToQueued(conversationId, leftoverSteers, {
            generationProtocolVersion: getGenerationProtocolVersion(generationStatus),
          });
          recoveringConversationRef.current = null;
          return;
        }

        if (recoveredMessages != null) {
          recoveringConversationRef.current = null;
          return;
        }

        recoveringConversationRef.current = null;
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
  }, [
    conversationId,
    convertSteersToQueued,
    enabled,
    isFetching,
    isSuccess,
    queryClient,
    refetchStreamStatus,
    streamStatus,
    streamStatusError,
  ]);
}
