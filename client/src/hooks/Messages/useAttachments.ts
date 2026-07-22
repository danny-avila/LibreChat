import { useMemo } from 'react';
import { useRecoilValue } from 'recoil';
import type { TAttachment, TFile } from 'librechat-data-provider';
import { useSearchResultsByTurn } from './useSearchResultsByTurn';
import store from '~/store';

/**
 * Stable identity for merging DB and live attachments: `file_id ?? filepath`
 * scoped by `toolCallId` (sibling code calls can share a claimed file_id for
 * the same filename, each anchoring its own card), else `type:toolCallId`
 * for unkeyed tool artifacts like file_search citations. Undefined = no
 * stable identity.
 */
function attachmentKey(attachment: TAttachment): string | undefined {
  const { file_id, filepath } = attachment as Partial<TFile>;
  const { type, toolCallId } = attachment as { type?: string; toolCallId?: string };
  const fileKey = file_id ?? filepath;
  if (fileKey) {
    return toolCallId ? `${fileKey}::${toolCallId}` : fileKey;
  }
  if (type != null && toolCallId != null) {
    return `${type}:${toolCallId}`;
  }
  return undefined;
}

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
    const liveByKey = new Map<string, TAttachment>();
    for (const a of live) {
      const key = attachmentKey(a);
      if (key) {
        liveByKey.set(key, a);
      }
    }
    const dbKeys = new Set<string>();
    const merged = attachments.map((db) => {
      const key = attachmentKey(db);
      if (!key) {
        return db;
      }
      dbKeys.add(key);
      const liveEntry = liveByKey.get(key);
      return liveEntry ? ({ ...db, ...liveEntry } as TAttachment) : db;
    });
    /* Live-only entries with a stable identity are kept, not discarded: a
     * background code task's harvested files arrive via SSE anchored to a
     * message whose DB `attachments` snapshot predates them (the row is
     * patched post-finalize), so treating the DB list as exhaustive would
     * make those files vanish until a full reload. Entries whose key is
     * already in the DB list (e.g. unkeyed file_search citations replayed
     * by the final message event) are duplicates, and entries with no
     * stable identity at all cannot be deduped — both are dropped. */
    const liveOnly = live.filter((a) => {
      const key = attachmentKey(a);
      return key != null && !dbKeys.has(key);
    });
    return liveOnly.length > 0 ? [...merged, ...liveOnly] : merged;
  }, [attachments, messageAttachmentsMap, messageId]);

  const searchResults = useSearchResultsByTurn(messageAttachments);

  return {
    attachments: messageAttachments,
    searchResults,
  };
}
