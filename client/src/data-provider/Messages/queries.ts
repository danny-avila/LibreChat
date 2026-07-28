import { useLayoutEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Constants, QueryKeys, dataService } from 'librechat-data-provider';
import type { UseQueryOptions, QueryObserverResult, QueryClient } from '@tanstack/react-query';
import type * as t from 'librechat-data-provider';
import { hasStreamStartFailed, isNotFoundError, logger } from '~/utils';

type StableMessagesParams = {
  pathname: string;
  result: t.TMessage[];
  isStreaming?: boolean;
  currentMessages?: t.TMessage[];
};

type ActiveJobs = {
  activeJobIds?: string[];
};

type FetchMessagesParams = {
  id: string;
  pathname: string;
  queryClient: QueryClient;
  isStreaming?: () => boolean;
  protectActiveStream?: boolean;
};

function isUnhydratedMessage(message: t.TMessage) {
  const messageId = message.messageId ?? '';
  return message.createdAt == null || message.updatedAt == null || messageId.endsWith('_');
}

function hasPendingAssistantTail(messages: t.TMessage[]) {
  const lastMessage = messages[messages.length - 1];
  const parentMessageId = lastMessage?.parentMessageId ?? '';
  return (
    lastMessage?.isCreatedByUser !== true &&
    parentMessageId !== '' &&
    parentMessageId !== Constants.NO_PARENT &&
    isUnhydratedMessage(lastMessage)
  );
}

function isMessagePrefix(result: t.TMessage[], currentMessages: t.TMessage[]) {
  return result.every((message, index) => message.messageId === currentMessages[index]?.messageId);
}

function getStreamStartFailureSuffixIndex(messages: t.TMessage[]): number {
  const responseIndex = messages.length - 1;
  const response = messages[responseIndex];
  const userMessage = messages[responseIndex - 1];

  if (
    response?.isCreatedByUser === true ||
    !hasStreamStartFailed(response) ||
    userMessage?.isCreatedByUser !== true ||
    response.parentMessageId !== userMessage.messageId
  ) {
    return -1;
  }

  return responseIndex - 1;
}

function preserveStreamStartFailure(
  result: t.TMessage[],
  currentMessages: t.TMessage[],
): t.TMessage[] | undefined {
  const suffixIndex = getStreamStartFailureSuffixIndex(currentMessages);
  if (suffixIndex === -1 || !isMessagePrefix(result, currentMessages)) {
    return undefined;
  }

  const appendFrom = Math.max(result.length, suffixIndex);
  return [...result, ...currentMessages.slice(appendFrom)];
}

export function getStableMessages({
  pathname,
  result,
  isStreaming = false,
  currentMessages,
}: StableMessagesParams): t.TMessage[] {
  if (pathname.includes('/c/new') || !currentMessages?.length) {
    return result;
  }

  if (result.length >= currentMessages.length) {
    return result;
  }

  const messagesWithStartFailure = preserveStreamStartFailure(result, currentMessages);
  if (messagesWithStartFailure) {
    return messagesWithStartFailure;
  }

  if (
    isStreaming &&
    hasPendingAssistantTail(currentMessages) &&
    isMessagePrefix(result, currentMessages)
  ) {
    return currentMessages;
  }

  return result;
}

export function shouldPreserveMessagesOnNotFound({
  pathname,
  isStreaming = false,
  currentMessages,
}: Pick<StableMessagesParams, 'pathname' | 'isStreaming' | 'currentMessages'>): boolean {
  if (pathname.includes('/c/new') || !currentMessages?.length) {
    return false;
  }

  return (
    getStreamStartFailureSuffixIndex(currentMessages) !== -1 ||
    (isStreaming && hasPendingAssistantTail(currentMessages))
  );
}

function hasActiveJob(queryClient: QueryClient, id: string) {
  if (!id) {
    return false;
  }
  const activeJobs = queryClient.getQueryData<ActiveJobs>([QueryKeys.activeJobs]);
  return activeJobs?.activeJobIds?.includes(id) === true;
}

export async function fetchMessagesWithCacheProtection({
  id,
  pathname,
  queryClient,
  isStreaming = () => false,
  protectActiveStream = true,
}: FetchMessagesParams): Promise<t.TMessage[]> {
  const queryKey = [QueryKeys.messages, id];
  const messagesAtRequestStart = queryClient.getQueryData<t.TMessage[]>(queryKey);

  if (id === Constants.NEW_CONVO) {
    return messagesAtRequestStart ?? [];
  }

  let result: t.TMessage[];
  try {
    result = await dataService.getMessagesByConvoId(id);
  } catch (error) {
    const currentMessages = queryClient.getQueryData<t.TMessage[]>(queryKey);
    if (
      messagesAtRequestStart != null &&
      currentMessages != null &&
      currentMessages !== messagesAtRequestStart
    ) {
      return currentMessages;
    }

    const hasLiveStream = protectActiveStream && (isStreaming() || hasActiveJob(queryClient, id));
    if (
      currentMessages &&
      isNotFoundError(error) &&
      shouldPreserveMessagesOnNotFound({
        pathname,
        currentMessages,
        isStreaming: hasLiveStream,
      })
    ) {
      logger.warn(
        'messages',
        `Messages query for convo ${id} returned 404 while cache has a pending assistant tail; path: "${pathname}"`,
        currentMessages,
      );
      return currentMessages;
    }

    throw error;
  }

  const currentMessages = queryClient.getQueryData<t.TMessage[]>(queryKey);
  if (
    messagesAtRequestStart != null &&
    currentMessages != null &&
    currentMessages !== messagesAtRequestStart
  ) {
    return currentMessages;
  }

  const stableMessages = getStableMessages({
    pathname,
    result,
    currentMessages,
    isStreaming: protectActiveStream && (isStreaming() || hasActiveJob(queryClient, id)),
  });

  if (stableMessages === currentMessages) {
    logger.warn(
      'messages',
      `Messages query for convo ${id} returned fewer than cache; path: "${pathname}"`,
      result,
      currentMessages,
    );
  }

  return stableMessages;
}

export const useGetMessagesByConvoId = <TData = t.TMessage[]>(
  id: string,
  config?: UseQueryOptions<t.TMessage[], unknown, TData>,
  options?: { isStreaming?: boolean },
): QueryObserverResult<TData> => {
  const location = useLocation();
  const queryClient = useQueryClient();
  const isStreaming = options?.isStreaming === true;
  const isStreamingRef = useRef(isStreaming);

  useLayoutEffect(() => {
    isStreamingRef.current = isStreaming;
  }, [isStreaming]);

  return useQuery<t.TMessage[], unknown, TData>(
    [QueryKeys.messages, id],
    () =>
      fetchMessagesWithCacheProtection({
        id,
        pathname: location.pathname,
        queryClient,
        isStreaming: () => isStreamingRef.current,
      }),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      ...config,
    },
  );
};
