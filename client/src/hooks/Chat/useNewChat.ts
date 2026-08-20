import { useCallback } from 'react';
import { useRecoilValue } from 'recoil';
import { QueryKeys } from 'librechat-data-provider';
import { useQueryClient } from '@tanstack/react-query';
import type { TFile } from 'librechat-data-provider';
import type { MouseEvent } from 'react';
import {
  clearAllDrafts,
  clearMessagesCache,
  getFilesDraft,
  getNewConversationDraftId,
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
  const saveDrafts = useRecoilValue(store.saveDrafts);
  const { data: fileList } = useGetFiles<TFile[]>();
  const { mutateAsync } = useDeleteFilesMutation();

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
     * reference to them, so the uploads are deleted here rather than orphaned. */
    const draftId = getNewConversationDraftId(index);
    if (saveDrafts) {
      const filesDraft = getFilesDraft(draftId);
      const draftFileIds = new Set([
        ...filesDraft.fileIds,
        ...Object.keys(filesDraft.pendingPastes),
      ]);
      const filesToDelete = Array.from(draftFileIds).flatMap((fileId) => {
        const record = fileList?.find((entry) => entry.file_id === fileId);
        if (
          record == null ||
          record.embedded === true ||
          record.filepath == null ||
          record.filepath === '' ||
          !record.source
        ) {
          return [];
        }
        return [
          {
            file_id: record.file_id,
            embedded: false,
            filepath: record.filepath,
            source: record.source,
          },
        ];
      });
      if (filesToDelete.length > 0) {
        mutateAsync({ files: filesToDelete });
      }
    }
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
