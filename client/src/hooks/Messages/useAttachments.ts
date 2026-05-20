import { useMemo } from 'react';
import { useRecoilValue } from 'recoil';
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
  const messageAttachmentsMap = useRecoilValue(store.messageAttachmentsMap);
  const messageAttachments = useMemo(() => {
    const fromMessage = attachments ?? [];
    const fromStream = messageAttachmentsMap[messageId ?? ''] ?? [];
    if (fromMessage.length === 0) {
      return fromStream;
    }
    if (fromStream.length === 0) {
      return fromMessage;
    }
    const seen = new Set(fromMessage.map((a) => a.toolCallId ?? a.file_id ?? JSON.stringify(a)));
    return [
      ...fromMessage,
      ...fromStream.filter((a) => {
        const id = a.toolCallId ?? a.file_id ?? JSON.stringify(a);
        return !seen.has(id);
      }),
    ];
  }, [attachments, messageAttachmentsMap, messageId]);

  const searchResults = useSearchResultsByTurn(messageAttachments);

  return {
    attachments: messageAttachments,
    searchResults,
  };
}
