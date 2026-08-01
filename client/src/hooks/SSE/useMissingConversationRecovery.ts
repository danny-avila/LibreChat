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
  const { data: streamStatus, isFetching, isSuccess } = useStreamStatus(conversationId, enabled);
  const streamStatusRef = useRef(streamStatus);

  useLayoutEffect(() => {
    onConfirmedMissingRef.current = onConfirmedMissing;
  }, [onConfirmedMissing]);

  useLayoutEffect(() => {
    streamStatusRef.current = streamStatus;
  }, [streamStatus]);

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
          return;
        }

        if (recoveredMessages != null) {
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
  }, [
    conversationId,
    convertSteersToQueued,
    enabled,
    isFetching,
    isSuccess,
    queryClient,
    streamStatus?.active,
  ]);
}
