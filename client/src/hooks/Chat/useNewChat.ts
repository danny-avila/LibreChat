import { useCallback, useEffect, useState } from 'react';
import { useRecoilValue } from 'recoil';
import { QueryKeys } from 'librechat-data-provider';
import { useQueryClient } from '@tanstack/react-query';
import type { FileSources, TFile } from 'librechat-data-provider';
import type { MouseEvent } from 'react';
import type { ExtendedFile } from '~/common';
import {
  clearAllDrafts,
  clearMessagesCache,
  clearRetainedFileDeletion,
  getBrowserTabId,
  getFilesDraft,
  getNewConversationDraftId,
  getPendingDraftId,
  takeRetainedFileDeletions,
} from '~/utils';
import { useGetFiles, useDeleteFilesMutation } from '~/data-provider';
import useNewConvo from '~/hooks/useNewConvo';
import store from '~/store';

export type UseNewChatParams = {
  index?: number;
  /**
   * Runs once the conversation has been reset. The sidebar uses it to switch
   * back to the conversations panel; callers outside `ActivePanelProvider`
   * (the chat header, keyboard shortcuts) omit it.
   */
  onNewChat?: () => void;
};

export type UseNewChatResult = {
  startNewChat: () => void;
  /** For an `<a href="/c/new">` trigger, so modified clicks still open a tab. */
  handleNewChatClick: (event: MouseEvent<HTMLElement>) => void;
  newConversation: ReturnType<typeof useNewConvo>['newConversation'];
};

type DeletableRecord = {
  file_id: string;
  embedded: false;
  filepath: string;
  source: FileSources;
};

const toDeletableRecord = (record: TFile): DeletableRecord | null => {
  if (
    record.embedded === true ||
    record.filepath == null ||
    record.filepath === '' ||
    !record.source
  ) {
    return null;
  }
  return {
    file_id: record.file_id,
    embedded: false,
    filepath: record.filepath,
    source: record.source,
  };
};

/** Every id the composer currently owns: map keys plus their resolved file ids. Pastes stay
 * owned even when restoration stamped them `attached`, because the draft says they are ours. */
const collectOwnedIds = (files: Map<string, ExtendedFile>, pasteIds: Set<string>): Set<string> => {
  const ownedIds = new Set<string>();
  files.forEach((file, key) => {
    if (file.attached === true && !pasteIds.has(key) && !pasteIds.has(file.file_id)) {
      return;
    }
    ownedIds.add(key);
    if (file.file_id != null) {
      ownedIds.add(file.file_id);
    }
  });
  return ownedIds;
};

/** The draft and the composer map carry a request's own uuid, while the files cache keys the
 * record by the server-assigned file id and remembers the request id as `temp_file_id`, so a
 * discard is matched through either identity. */
const findFilesRecord = (fileList: TFile[] | undefined, fileId: string): TFile | undefined =>
  fileList?.find((entry) => entry.file_id === fileId || entry.temp_file_id === fileId);

/**
 * Single source of truth for starting a new conversation: drops the cached
 * messages for the outgoing conversation, invalidates the messages query, then
 * resets the conversation atom.
 */
export default function useNewChat({
  index = 0,
  onNewChat,
}: UseNewChatParams = {}): UseNewChatResult {
  const queryClient = useQueryClient();
  const { newConversation } = useNewConvo(index);
  const conversationId = useRecoilValue(store.conversationIdByIndex(index));
  const files = useRecoilValue(store.filesByIndex(index));
  const saveDrafts = useRecoilValue(store.saveDrafts);
  const { data: fileList } = useGetFiles<TFile[]>();
  const { mutateAsync } = useDeleteFilesMutation();
  /** Draft uploads whose records were not resolvable when the draft was discarded: the files
   * cache was still loading, or the upload was still in flight and completed only after. */
  const [pendingDiscardIds, setPendingDiscardIds] = useState<string[]>([]);

  useEffect(() => {
    const retained = takeRetainedFileDeletions();
    if ((pendingDiscardIds.length === 0 && retained.length === 0) || fileList == null) {
      return;
    }
    let cancelled = false;
    const attempt = async () => {
      /** An id that came back, as a live chip or inside the fresh draft, is no longer the
       * discarded draft's to delete. */
      const reattached = new Set(getFilesDraft(getNewConversationDraftId(index)).fileIds);
      files.forEach((file, key) => {
        reattached.add(key);
        if (file.file_id != null) {
          reattached.add(file.file_id);
        }
      });
      const deletable: DeletableRecord[] = [];
      const stillPending: string[] = [];
      for (const fileId of pendingDiscardIds) {
        if (reattached.has(fileId)) {
          continue;
        }
        const record = findFilesRecord(fileList, fileId);
        if (record == null) {
          stillPending.push(fileId);
          continue;
        }
        const deletableRecord = toDeletableRecord(record);
        if (deletableRecord != null) {
          deletable.push(deletableRecord);
        }
      }
      /** Deletions other flows retained after a failed request ride along: their payloads
       * cannot be rebuilt, so they retry here until one succeeds. */
      const batch = [...deletable, ...retained];
      if (batch.length > 0) {
        try {
          await mutateAsync({ files: batch });
        } catch {
          /** The draft is already gone, so these ids are the only record of what to clean:
           * keep them for the next files-cache update rather than orphaning the uploads. */
          return;
        }
        for (const record of retained) {
          clearRetainedFileDeletion(record.file_id);
        }
      }
      if (!cancelled && stillPending.length !== pendingDiscardIds.length) {
        setPendingDiscardIds(stillPending);
      }
    };
    void attempt();
    return () => {
      cancelled = true;
    };
  }, [pendingDiscardIds, fileList, files, index, mutateAsync]);

  const startNewChat = useCallback(() => {
    clearMessagesCache(queryClient, conversationId);
    queryClient.invalidateQueries([QueryKeys.messages]);
    /** `newConversation` empties the composer, but the unsaved-chat draft key outlives it and
     * `useAutoSave` restores from that key on the way in, so an unsent paste came back on every
     * later new chat. Dropping the key first makes an explicit new chat an actual clean slate,
     * for the text draft and its attachments alike. Per-conversation drafts are untouched.
     *
     * With draft saving on, `newConversation` deliberately leaves the draft's files alive
     * because a draft normally keeps them restorable; discarding the draft removes the only
     * reference to them, so the uploads are deleted here rather than orphaned. Two limits keep
     * that deletion safe: the unsaved-chat key is shared by every tab's default composer, so a
     * record stamped with another tab's id is left alone, and only ids the composer still owns
     * are deleted, because the draft also records library attaches whose files other messages
     * share. Ids the composer no longer shows cannot be told apart from those, so they are left
     * to retention cleanup; ids still uploading are kept until their records arrive. */
    const draftId = getNewConversationDraftId(index);
    if (saveDrafts) {
      const filesDraft = getFilesDraft(draftId);
      if (filesDraft.tabId == null || filesDraft.tabId === getBrowserTabId()) {
        const pasteIds = new Set(filesDraft.pastedTextIds ?? []);
        const ownedIds = collectOwnedIds(files, pasteIds);
        /** A draft's own paste provenance is ownership in itself: after a reload the composer
         * map may not be rebuilt yet when New Chat is clicked, and the chips those ids are
         * waiting to become would otherwise be skipped rather than discarded with the draft. */
        for (const pasteId of pasteIds) {
          ownedIds.add(pasteId);
        }
        const draftFileIds = new Set([
          ...filesDraft.fileIds,
          ...Object.keys(filesDraft.pendingPastes),
        ]);
        const deletable: DeletableRecord[] = [];
        const deferred: string[] = [];
        for (const fileId of draftFileIds) {
          if (!ownedIds.has(fileId)) {
            continue;
          }
          const record = findFilesRecord(fileList, fileId);
          const deletableRecord = record != null ? toDeletableRecord(record) : null;
          if (deletableRecord != null) {
            deletable.push(deletableRecord);
          } else if (record == null) {
            deferred.push(fileId);
          }
        }
        if (deletable.length > 0) {
          mutateAsync({ files: deletable }).catch(() => {
            /** A failed deletion is retried on the next files-cache update, exactly like a
             * deferred one, instead of orphaning the uploads. */
            const failedIds = deletable.map((record) => record.file_id);
            setPendingDiscardIds((current) => Array.from(new Set([...current, ...failedIds])));
          });
        }
        /** Merged, not replaced: a second reset while an earlier upload is still in flight
         * must not forget that earlier id, or its eventual record is orphaned. */
        setPendingDiscardIds((current) => Array.from(new Set([...current, ...deferred])));
      }
    }
    /** A running response parks this pane's composer under the pending key; the clean slate
     * discards that too, or the queued text and attachments come back with the next run. */
    clearAllDrafts(getPendingDraftId(index));
    clearAllDrafts(draftId);
    newConversation();
    onNewChat?.();
  }, [
    queryClient,
    conversationId,
    newConversation,
    onNewChat,
    index,
    saveDrafts,
    fileList,
    mutateAsync,
    files,
  ]);

  const handleNewChatClick = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey) {
        return;
      }
      event.preventDefault();
      startNewChat();
    },
    [startNewChat],
  );

  return { startNewChat, handleNewChatClick, newConversation };
}
