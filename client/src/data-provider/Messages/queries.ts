import { useLayoutEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Constants, QueryKeys, dataService } from 'librechat-data-provider';
import type { UseQueryOptions, QueryObserverResult, QueryClient } from '@tanstack/react-query';
import type * as t from 'librechat-data-provider';
import {
  beginMessagesReplyFetch,
  completeMessagesReplyFetch,
  findConvoInAllQueries,
  isNotFoundError,
  logger,
} from '~/utils';

type StableMessagesParams = {
  pathname: string;
  result: t.TMessage[];
  isStreaming?: boolean;
  currentMessages?: t.TMessage[];
};

type ActiveJobs = {
  activeJobIds?: string[];
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
  if (!isStreaming || pathname.includes('/c/new') || !currentMessages?.length) {
    return false;
  }

  return hasPendingAssistantTail(currentMessages);
}

/**
 * Loads a conversation's messages for the shared `[messages, id]` cache, with settled tool calls
 * as bounded previews. Every writer of that cache uses this, so the cache never flips between
 * preview and full payloads; a reader that needs every byte (export) asks for a full load.
 */
export function fetchConversationMessages(conversationId: string): Promise<t.TMessage[]> {
  return dataService.getMessagesByConvoId(conversationId, { toolPreviews: true });
}

/**
 * The stored content of one tool-call part, for a preview the reader opened. Kept under its own
 * key and never merged into `[messages, id]`, so a refetch of the conversation cannot drop it and
 * the conversation cache keeps only previews. `revision` (see `getToolCallPreviewRevision`) is
 * part of the key, so a stored call that changes after it was fetched is fetched again.
 */
export const useToolCallPartQuery = (
  params: t.ToolCallPartParams,
  config?: UseQueryOptions<t.ToolCallPartResponse>,
  revision = '',
): QueryObserverResult<t.ToolCallPartResponse> => {
  /** The index only rides along in the request; the server locates the call by identity, so the
   *  cache does too, and a shifted index cannot fetch the same part twice. */
  const { conversationId, messageId, toolCallId, stepId, agentId } = params;
  return useQuery<t.ToolCallPartResponse>(
    [
      QueryKeys.toolCallPart,
      conversationId,
      messageId,
      toolCallId ?? '',
      stepId ?? '',
      agentId ?? '',
      revision,
    ],
    () => dataService.getToolCallPart(params),
    {
      staleTime: Infinity,
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      ...config,
    },
  );
};

/** How often, and how many times, a read that does not yet hold every file it resolves is repeated. */
const PREVIEW_HINTS_POLL_MS = 5_000;
const PREVIEW_HINTS_POLLS = 12;

/**
 * One stored message read back as a preview, for the `subagentAttachmentCalls` hints its previewed
 * subagent calls now carry: a file that reached the message after it loaded has no hint in the
 * cached preview. `fileIds` names the files the caller is resolving and keys the read, so a newer
 * file reads the message again. Nothing is written to `[messages, id]`. A background task can
 * stream its file before the file is saved on the message, so a read that does not hold every
 * file yet is repeated for a while; a failed read retries with backoff and runs again on focus
 * and reconnect.
 */
export const useMessagePreviewHintsQuery = (
  conversationId: string,
  messageId: string,
  fileIds: ReadonlyArray<string>,
  enabled: boolean,
): QueryObserverResult<t.TMessage | null> =>
  useQuery<t.TMessage | null>(
    [QueryKeys.messagePreviewHints, conversationId, messageId, fileIds.join(',')],
    async () => {
      const messages = await dataService.getMessageById(conversationId, messageId, {
        toolPreviews: true,
      });
      return messages?.[0] ?? null;
    },
    {
      enabled,
      staleTime: Infinity,
      retry: 3,
      refetchOnMount: false,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      refetchInterval: (message, query) => {
        /** Failed reads count too: a failing read keeps the earlier message as its data. */
        const reads = query.state.dataUpdateCount + query.state.errorUpdateCount;
        if (message == null || reads >= PREVIEW_HINTS_POLLS) {
          return false;
        }
        const saved = new Set(
          (message.attachments ?? []).map((file) => (file as { file_id?: string }).file_id),
        );
        return fileIds.every((id) => saved.has(id)) ? false : PREVIEW_HINTS_POLL_MS;
      },
    },
  );

function hasActiveJob(queryClient: QueryClient, id: string) {
  if (!id) {
    return false;
  }
  const activeJobs = queryClient.getQueryData<ActiveJobs>([QueryKeys.activeJobs]);
  return activeJobs?.activeJobIds?.includes(id) === true;
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
    async () => {
      const queryKey = [QueryKeys.messages, id];
      const messagesAtRequestStart = queryClient.getQueryData<t.TMessage[]>(queryKey);

      if (id === Constants.NEW_CONVO) {
        return messagesAtRequestStart ?? [];
      }

      const request = beginMessagesReplyFetch(
        queryClient,
        id,
        findConvoInAllQueries(queryClient, id)?.lastResponseAt,
      );
      let result: t.TMessage[];
      try {
        result = await fetchConversationMessages(id);
      } catch (error) {
        const currentMessages = queryClient.getQueryData<t.TMessage[]>(queryKey);
        if (
          messagesAtRequestStart != null &&
          currentMessages != null &&
          currentMessages !== messagesAtRequestStart
        ) {
          completeMessagesReplyFetch(queryClient, id, request, false);
          return currentMessages;
        }

        const hasLiveStream = isStreamingRef.current || hasActiveJob(queryClient, id);
        if (
          currentMessages &&
          isNotFoundError(error) &&
          shouldPreserveMessagesOnNotFound({
            pathname: location.pathname,
            currentMessages,
            isStreaming: hasLiveStream,
          })
        ) {
          logger.warn(
            'messages',
            `Messages query for convo ${id} returned 404 while cache has a pending assistant tail; path: "${location.pathname}"`,
            currentMessages,
          );
          completeMessagesReplyFetch(queryClient, id, request, false);
          return currentMessages;
        }

        completeMessagesReplyFetch(queryClient, id, request, false);
        throw error;
      }

      const currentMessages = queryClient.getQueryData<t.TMessage[]>(queryKey);
      if (
        messagesAtRequestStart != null &&
        currentMessages != null &&
        currentMessages !== messagesAtRequestStart
      ) {
        completeMessagesReplyFetch(queryClient, id, request, false);
        return currentMessages;
      }

      const stableMessages = getStableMessages({
        pathname: location.pathname,
        result,
        currentMessages,
        isStreaming: isStreamingRef.current || hasActiveJob(queryClient, id),
      });

      if (stableMessages === currentMessages) {
        logger.warn(
          'messages',
          `Messages query for convo ${id} returned fewer than cache; path: "${location.pathname}"`,
          result,
          currentMessages,
        );
      }

      completeMessagesReplyFetch(queryClient, id, request, stableMessages === result);
      return stableMessages;
    },
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      ...config,
    },
  );
};
