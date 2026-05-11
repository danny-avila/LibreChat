import { useMemo } from 'react';
import { useRecoilValue } from 'recoil';
import type { TAttachment, TFile } from 'librechat-data-provider';
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
  const messageAttachments = useMemo<TAttachment[]>(() => {
    const live = messageAttachmentsMap[messageId ?? ''];
    if (!attachments || attachments.length === 0) {
      return live ?? [];
    }
    if (!live || live.length === 0) {
      return attachments;
    }
    /* DB-loaded attachments are the source of truth for which
     * attachments belong to this message, but live entries (from the
     * SSE handler / `useAttachmentPreviewSync` polling) carry fresher
     * lifecycle fields — `status`, `text`, `textFormat`,
     * `previewError`. Without this merge, the deferred-preview flow
     * would render "stuck pending" forever on a loaded conversation:
     * the message saved to DB at end-of-run has the immediate-persist
     * snapshot (`status: 'pending'`, `text: null`); the file record
     * itself updates to `'ready'` later, but the message's
     * `attachments` array doesn't get rewritten. Polling fetches the
     * resolved record into `messageAttachmentsMap`; merging here lets
     * `artifactTypeForAttachment` see the resolved text/textFormat
     * and route through the proper PanelArtifact card. */
    const liveByFileId = new Map<string, TAttachment>();
    for (const a of live) {
      const id = (a as Partial<TFile>).file_id;
      if (id) {
        liveByFileId.set(id, a);
      }
    }
    return attachments.map((db) => {
      const id = (db as Partial<TFile>).file_id;
      if (!id) {
        return db;
      }
      const liveEntry = liveByFileId.get(id);
      return liveEntry ? ({ ...db, ...liveEntry } as TAttachment) : db;
    });
  }, [attachments, messageAttachmentsMap, messageId]);

  const searchResults = useSearchResultsByTurn(messageAttachments);

  return {
    attachments: messageAttachments,
    searchResults,
  };
}
