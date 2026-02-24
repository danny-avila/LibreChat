import { useEffect, useMemo, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ContentTypes, LocalStorageKeys, QueryKeys } from 'librechat-data-provider';
import type { TMessage, TStartupConfig } from 'librechat-data-provider';
import type { QueryClient } from '@tanstack/react-query';
import type { StreamStatusResponse } from '~/data-provider';
import {
  notifyStreamCompletion,
  isStreamCompletionSuppressed,
  suppressStreamCompletionNotification,
} from './streamCompletionNotification';
import { fetchStreamStatus, useActiveJobs } from '~/data-provider';
import { getAllContentText } from '~/utils';
import { useLocalize } from '~/hooks';

const UNKNOWN_STATUS_RECHECK_DELAY_MS = 1200;
const MAX_FETCH_FAILURES = 3;

type UseBackgroundStreamCompletionNotificationsParams = {
  enabled: boolean;
  notifyOnStreamComplete: boolean;
  currentConversationId?: string | null;
};

type TCompletionStatus = 'running' | 'complete' | 'aborted' | 'error' | 'unknown';
type TFetchStreamStatusResult = {
  fetched: boolean;
  streamStatus: StreamStatusResponse | null;
};

type TLooseTextPart = {
  type?: string;
  text?: string | { value?: string | null } | null;
};

const getNotificationTitle = (queryClient: QueryClient): string => {
  const storedAppTitle =
    typeof localStorage !== 'undefined' ? localStorage.getItem(LocalStorageKeys.APP_TITLE) : null;
  return (
    storedAppTitle ||
    queryClient.getQueryData<TStartupConfig>([QueryKeys.startupConfig])?.appTitle ||
    'LibreChat'
  );
};

const extractTextFromLooseContent = (content?: TLooseTextPart[]): string => {
  if (!content || content.length === 0) {
    return '';
  }

  const textParts: string[] = [];
  for (let i = 0; i < content.length; i++) {
    const contentPart = content[i];
    if (!contentPart || contentPart.type !== ContentTypes.TEXT) {
      continue;
    }

    const textValue =
      typeof contentPart.text === 'string' ? contentPart.text : (contentPart.text?.value ?? '');
    if (textValue.length > 0) {
      textParts.push(textValue);
    }
  }

  return textParts.join('\n').trim();
};

const getLatestAssistantTextFromCache = (
  queryClient: QueryClient,
  conversationId: string,
): string | undefined => {
  const cachedMessages = queryClient.getQueryData<TMessage[]>([QueryKeys.messages, conversationId]);
  if (!cachedMessages || cachedMessages.length === 0) {
    return undefined;
  }

  for (let i = cachedMessages.length - 1; i >= 0; i--) {
    const message = cachedMessages[i];
    if (!message || message.isCreatedByUser) {
      continue;
    }
    const text = getAllContentText(message).trim();
    if (text.length > 0) {
      return text;
    }
  }

  return undefined;
};

const getStreamResponseText = (
  queryClient: QueryClient,
  conversationId: string,
  streamStatus: StreamStatusResponse | null,
): string | undefined => {
  const resumeText = extractTextFromLooseContent(
    streamStatus?.resumeState?.aggregatedContent as TLooseTextPart[] | undefined,
  );
  if (resumeText.length > 0) {
    return resumeText;
  }

  const aggregatedText = extractTextFromLooseContent(streamStatus?.aggregatedContent);
  if (aggregatedText.length > 0) {
    return aggregatedText;
  }

  return getLatestAssistantTextFromCache(queryClient, conversationId);
};

const getCompletionStatus = (streamStatus: StreamStatusResponse | null): TCompletionStatus => {
  if (!streamStatus) {
    return 'unknown';
  }
  if (streamStatus.active === true || streamStatus.status === 'running') {
    return 'running';
  }
  if (streamStatus.status === 'complete') {
    return 'complete';
  }
  if (streamStatus.status === 'aborted') {
    return 'aborted';
  }
  if (streamStatus.status === 'error') {
    return 'error';
  }
  return 'unknown';
};

const fetchStreamStatusSafe = async (streamId: string): Promise<TFetchStreamStatusResult> => {
  try {
    return {
      fetched: true,
      streamStatus: await fetchStreamStatus(streamId),
    };
  } catch (error) {
    console.error(
      `[StreamCompletionWatcher] Failed to fetch stream status for ${streamId}:`,
      error,
    );
    return {
      fetched: false,
      streamStatus: null,
    };
  }
};

const wait = (delayMs: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });

export default function useBackgroundStreamCompletionNotifications({
  enabled,
  notifyOnStreamComplete,
  currentConversationId,
}: UseBackgroundStreamCompletionNotificationsParams) {
  const queryClient = useQueryClient();
  const localize = useLocalize();
  const previousActiveJobsRef = useRef<Set<string>>(new Set());
  const pendingCompletionChecksRef = useRef<Set<string>>(new Set());
  const fetchFailureCountsRef = useRef<Map<string, number>>(new Map());
  const { data: activeJobsData } = useActiveJobs(enabled);

  const activeJobIds = useMemo(
    () => activeJobsData?.activeJobIds ?? [],
    [activeJobsData?.activeJobIds],
  );

  useEffect(() => {
    const activeJobsSet = new Set(activeJobIds);
    const previousActiveJobs = previousActiveJobsRef.current;
    const pendingChecks = pendingCompletionChecksRef.current;

    for (const previousJobId of previousActiveJobs) {
      if (!activeJobsSet.has(previousJobId)) {
        pendingChecks.add(previousJobId);
      }
    }

    for (const activeJobId of activeJobsSet) {
      pendingChecks.delete(activeJobId);
    }

    previousActiveJobsRef.current = activeJobsSet;

    if (!enabled || !notifyOnStreamComplete || pendingChecks.size === 0) {
      if (!notifyOnStreamComplete) {
        pendingChecks.clear();
      }
      return;
    }

    let cancelled = false;

    const failureCounts = fetchFailureCountsRef.current;

    const evictStream = (streamId: string) => {
      pendingChecks.delete(streamId);
      failureCounts.delete(streamId);
    };

    const recordFetchFailure = (streamId: string): boolean => {
      const count = (failureCounts.get(streamId) ?? 0) + 1;
      if (count >= MAX_FETCH_FAILURES) {
        evictStream(streamId);
        return true;
      }
      failureCounts.set(streamId, count);
      return false;
    };

    const maybeNotifyForCompletedJobs = async () => {
      const pendingIds = Array.from(pendingChecks);

      for (let i = 0; i < pendingIds.length; i++) {
        if (cancelled) {
          return;
        }

        const streamId = pendingIds[i];
        if (activeJobsSet.has(streamId)) {
          evictStream(streamId);
          continue;
        }

        if (currentConversationId && streamId === currentConversationId) {
          evictStream(streamId);
          continue;
        }

        if (isStreamCompletionSuppressed(streamId)) {
          evictStream(streamId);
          continue;
        }

        const firstStatusResult = await fetchStreamStatusSafe(streamId);
        if (cancelled) {
          return;
        }
        if (!firstStatusResult.fetched) {
          recordFetchFailure(streamId);
          continue;
        }
        const firstStatus = firstStatusResult.streamStatus;

        const firstCompletionStatus = getCompletionStatus(firstStatus);
        if (firstCompletionStatus === 'running') {
          continue;
        }
        if (firstCompletionStatus === 'aborted' || firstCompletionStatus === 'error') {
          evictStream(streamId);
          continue;
        }

        if (firstCompletionStatus === 'unknown') {
          await wait(UNKNOWN_STATUS_RECHECK_DELAY_MS);
          if (cancelled) {
            return;
          }
          if (isStreamCompletionSuppressed(streamId)) {
            evictStream(streamId);
            continue;
          }

          const secondStatusResult = await fetchStreamStatusSafe(streamId);
          if (cancelled) {
            return;
          }
          if (!secondStatusResult.fetched) {
            recordFetchFailure(streamId);
            continue;
          }
          const secondStatus = secondStatusResult.streamStatus;

          const secondCompletionStatus = getCompletionStatus(secondStatus);
          if (secondCompletionStatus === 'running') {
            continue;
          }
          if (secondCompletionStatus === 'aborted' || secondCompletionStatus === 'error') {
            evictStream(streamId);
            continue;
          }
          if (secondCompletionStatus === 'complete') {
            const responseText = getStreamResponseText(queryClient, streamId, secondStatus);
            notifyStreamCompletion({
              enabled: notifyOnStreamComplete,
              title: getNotificationTitle(queryClient),
              fallbackMessage: localize('com_nav_stream_complete_notification'),
              responseText,
            });
            suppressStreamCompletionNotification(streamId, 10_000);
            evictStream(streamId);
          }
          continue;
        }

        if (firstCompletionStatus === 'complete') {
          const responseText = getStreamResponseText(queryClient, streamId, firstStatus);
          notifyStreamCompletion({
            enabled: notifyOnStreamComplete,
            title: getNotificationTitle(queryClient),
            fallbackMessage: localize('com_nav_stream_complete_notification'),
            responseText,
          });
          suppressStreamCompletionNotification(streamId, 10_000);
          evictStream(streamId);
        }
      }
    };

    void maybeNotifyForCompletedJobs();

    return () => {
      cancelled = true;
    };
  }, [enabled, localize, queryClient, activeJobIds, currentConversationId, notifyOnStreamComplete]);
}
