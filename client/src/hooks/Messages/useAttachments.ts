import { useMemo } from 'react';
import { useAtomValue } from 'jotai';
import type { TAttachment } from 'librechat-data-provider';
import { useSearchResultsByTurn } from './useSearchResultsByTurn';
import store from '~/store';

export default function useAttachments({
  messageId,
  attachments,
}: {
  messageId?: string;
  attachments?: TAttachment[];
}) {
  const messageAttachmentsMap = useAtomValue(store.messageAttachmentsMap);
  const messageAttachments = useMemo(
    () => attachments ?? messageAttachmentsMap[messageId ?? ''] ?? [],
    [attachments, messageAttachmentsMap, messageId],
  );

  const searchResults = useSearchResultsByTurn(messageAttachments);

  return {
    attachments: messageAttachments,
    searchResults,
  };
}
