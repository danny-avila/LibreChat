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
const MESSAGE_RECHECK_RETRY_LIMIT = 1;
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
    const initialLegacyClaimedSteers =
      initialStatus != null && getGenerationProtocolVersion(initialStatus) === 1
        ? dedupeSteersById(initialStatus.unrecoveredSteers)
        : [];
    const initialLegacyClaimedIds = new Set(
      initialLegacyClaimedSteers.flatMap((steer) =>
        steer.clientSteerId ? [steer.steerId, steer.clientSteerId] : [steer.steerId],
      ),
    );
    const wasInitiallyClaimed = (steer: { steerId: string; clientSteerId?: string }) =>
      initialLegacyClaimedIds.has(steer.steerId) ||
      (steer.clientSteerId != null && initialLegacyClaimedIds.has(steer.clientSteerId));
    if (initialLegacyClaimedSteers.length > 0) {
      convertSteersToQueued(conversationId, initialLegacyClaimedSteers, {
        generationProtocolVersion: 1,
      });
    }
    let messageRetryTimeout: ReturnType<typeof setTimeout> | undefined;
    let readinessRetryTimeout: ReturnType<typeof setTimeout> | undefined;
    const recover = async (messageRetriesRemaining: number) => {
      let recoveredMessages: TMessage[] | null = null;
      try {
        recoveredMessages = await dataService.getMessagesByConvoId(conversationId);
      } catch (error) {
        if (cancelled) {
          return;
        }
        if (!isNotFoundError(error)) {
          if (messageRetriesRemaining > 0) {
            messageRetryTimeout = setTimeout(() => {
              if (!cancelled) {
                void recover(messageRetriesRemaining - 1);
              }
            }, MESSAGE_RECHECK_DELAY_MS);
          }
          return;
        }
      }
      const recoveredMessageList = recoveredMessages ?? [];
      const hasRecoveredMessages = recoveredMessageList.length > 0;
      if (cancelled) {
        return;
      }

      let verifiedStatus;
      try {
        verifiedStatus = await fetchStreamStatus(conversationId);
      } catch (error) {
        if (!cancelled && hasRecoveredMessages) {
          queryClient.setQueryData<TMessage[]>(
            [QueryKeys.messages, conversationId],
            recoveredMessageList,
          );
        }
        if (!cancelled && isServerNotReadyError(error)) {
          readinessRetryTimeout = setTimeout(() => {
            if (!cancelled) {
              void refetchStreamStatus();
            }
          }, MESSAGE_RECHECK_DELAY_MS);
        }
        return;
      }
      if (cancelled) {
        // A legacy status read destructively claims these steers. Preserve
        // their words even though the abandoned view must receive no updates.
        const claimedSteers = dedupeSteersById(verifiedStatus.unrecoveredSteers).filter(
          (steer) => !wasInitiallyClaimed(steer),
        );
        if (claimedSteers.length > 0) {
          convertSteersToQueued(conversationId, claimedSteers, {
            generationProtocolVersion: getGenerationProtocolVersion(verifiedStatus),
          });
        }
        return;
      }

      if (hasRecoveredMessages) {
        queryClient.setQueryData<TMessage[]>(
          [QueryKeys.messages, conversationId],
          recoveredMessageList,
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
      ).filter((steer) => !wasInitiallyClaimed(steer));
      if (leftoverSteers.length > 0) {
        const generationStatus =
          verifiedStatus.generationProtocolVersion == null ? initialStatus : verifiedStatus;
        convertSteersToQueued(conversationId, leftoverSteers, {
          generationProtocolVersion: getGenerationProtocolVersion(generationStatus),
        });
        recoveringConversationRef.current = null;
        return;
      }

      if (initialLegacyClaimedSteers.length > 0) {
        recoveringConversationRef.current = null;
        return;
      }

      if (hasRecoveredMessages) {
        recoveringConversationRef.current = null;
        return;
      }

      recoveringConversationRef.current = null;
      removeConvoFromAllQueries(queryClient, conversationId);
      queryClient.removeQueries({ queryKey: [QueryKeys.conversation, conversationId] });
      queryClient.removeQueries({ queryKey: [QueryKeys.messages, conversationId] });
      queryClient.setQueryData<TMessage[]>([QueryKeys.messages, Constants.NEW_CONVO], []);
      onConfirmedMissingRef.current();
    };
    const timeout = setTimeout(() => {
      void recover(MESSAGE_RECHECK_RETRY_LIMIT);
    }, MESSAGE_RECHECK_DELAY_MS);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      clearTimeout(messageRetryTimeout);
      clearTimeout(readinessRetryTimeout);
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
