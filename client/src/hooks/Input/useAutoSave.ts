import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import debounce from 'lodash/debounce';
import { SetterOrUpdater, useRecoilValue } from 'recoil';
import { LocalStorageKeys, Constants } from 'librechat-data-provider';
import type { TFile } from 'librechat-data-provider';
import type { PendingTextAttachmentDraft } from '~/utils';
import type { ExtendedFile } from '~/common';
import {
  clearDraft,
  getDraft,
  getFilesDraft,
  isAskAnswerDraftId,
  setDraft,
  setFilesDraft,
} from '~/utils';
import { useChatFormContext } from '~/Providers';
import { useGetFiles } from '~/data-provider';
import store from '~/store';

export const useAutoSave = ({
  isSubmitting,
  conversationId: _conversationId,
  draftId,
  textAreaRef,
  setFiles,
  files,
}: {
  isSubmitting?: boolean;
  conversationId?: string | null;
  /** Explicit draft-key override — wins over the conversation id AND the
   *  PENDING_CONVO redirect. Set while an `ask_user_question` pause turns the
   *  composer into the answer box: the answer phase drafts under its own key,
   *  and the key change itself drives the save/restore swap below, so the
   *  conversation draft is stashed on entry and restored when the question
   *  resolves. */
  draftId?: string | null;
  textAreaRef?: React.RefObject<HTMLTextAreaElement>;
  files: Map<string, ExtendedFile>;
  setFiles: SetterOrUpdater<Map<string, ExtendedFile>>;
}) => {
  // setting for auto-save
  const { setValue } = useChatFormContext();
  const saveDrafts = useRecoilValue<boolean>(store.saveDrafts);
  const conversationId = draftId ?? (isSubmitting ? Constants.PENDING_CONVO : _conversationId);

  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const fileIds = useMemo(() => Array.from(files.keys()), [files]);
  const { data: fileList } = useGetFiles<TFile[]>();
  const filesRef = useRef(files);
  filesRef.current = files;

  const restoreFiles = useCallback(
    (id: string): PendingTextAttachmentDraft[] => {
      const filesDraft = getFilesDraft(id);

      if (filesDraft.fileIds.length === 0) {
        setFiles(new Map());
        return [];
      }
      if (fileList == null) {
        return [];
      }

      const activeFileIds = new Set(filesRef.current.keys());
      const fileIdsToKeep: string[] = [];
      const pendingPastes = { ...filesDraft.pendingPastes };
      const pastesToRecover: PendingTextAttachmentDraft[] = [];

      // Retrieve files stored in localStorage from files in fileList and set them to `setFiles`
      // If a file is found with `temp_file_id`, use `temp_file_id` as a key in `setFiles`
      filesDraft.fileIds.forEach((fileId) => {
        const fileData = fileList?.find((f) => f.file_id === fileId);
        const tempFileData = fileList?.find((f) => f.temp_file_id === fileId);
        const { fileToRecover, fileIdToRecover } = fileData
          ? { fileToRecover: fileData, fileIdToRecover: fileId }
          : {
              fileToRecover: tempFileData,
              fileIdToRecover: (tempFileData?.temp_file_id ?? '') || fileId,
            };

        if (fileToRecover) {
          fileIdsToKeep.push(fileId);
          delete pendingPastes[fileId];
          setFiles((currentFiles) => {
            const updatedFiles = new Map(currentFiles);
            updatedFiles.set(fileIdToRecover, {
              ...fileToRecover,
              progress: 1,
              attached: true,
              size: fileToRecover.bytes,
            });
            return updatedFiles;
          });
          return;
        }

        const pendingPaste = pendingPastes[fileId];
        if (pendingPaste && !activeFileIds.has(fileId)) {
          pastesToRecover.push(pendingPaste);
          delete pendingPastes[fileId];
          return;
        }

        fileIdsToKeep.push(fileId);
      });

      setFilesDraft(id, { fileIds: fileIdsToKeep, pendingPastes });
      return pastesToRecover;
    },
    [fileList, setFiles],
  );

  const restoreText = useCallback(
    (id: string, pendingPastes: PendingTextAttachmentDraft[] = []) => {
      let draftText = getDraft(id) ?? '';
      const orderedPastes = pendingPastes
        .map((pendingPaste, index) => ({ ...pendingPaste, index }))
        .sort((a, b) => b.selectionStart - a.selectionStart || b.index - a.index);

      for (const pendingPaste of orderedPastes) {
        const insertionPoint = Math.min(pendingPaste.selectionStart, draftText.length);
        draftText = `${draftText.slice(0, insertionPoint)}${pendingPaste.text}${draftText.slice(insertionPoint)}`;
      }

      if (pendingPastes.length > 0) {
        setDraft({ id, value: draftText });
      }
      setValue('text', draftText);
    },
    [setValue],
  );

  const saveText = useCallback(
    (id: string) => {
      if (!textAreaRef?.current) {
        return;
      }
      // Save the draft of the current conversation before switching
      if (textAreaRef.current.value === '' || textAreaRef.current.value.length === 1) {
        clearDraft(id);
      } else {
        setDraft({ id, value: textAreaRef.current.value });
      }
    },
    [textAreaRef],
  );

  useEffect(() => {
    // This useEffect is responsible for setting up and cleaning up the auto-save functionality
    // for the text area input. It saves the text to localStorage with a debounce to prevent
    // excessive writes.
    if (!saveDrafts || conversationId == null || conversationId === '') {
      return;
    }

    /** Saves the composer's value AT FLUSH TIME rather than the value captured
     *  when the event fired. A during-run steer/queue consumes the text and
     *  clears the composer programmatically, so a write still in flight would
     *  otherwise land after the submit and restore the just-sent text. */
    const saveLatest = () =>
      setDraft({ id: conversationId, value: textAreaRef?.current?.value ?? '' });

    /** Use shorter debounce for saving text (25ms) to capture rapid typing */
    const handleInputFast = debounce(saveLatest, 25);

    /** Use longer debounce for clearing empty values (850ms) to prevent accidental draft loss */
    const handleInputSlow = debounce(saveLatest, 850);

    const eventListener = (e: Event) => {
      const target = e.target as HTMLTextAreaElement;
      const value = target.value;

      /** Cancel any pending operations to avoid conflicts */
      handleInputFast.cancel();
      handleInputSlow.cancel();

      /** If empty, use long delay to prevent accidental clearing
       * Otherwise use short delay to capture rapid typing */
      if (value === '') {
        handleInputSlow();
      } else {
        handleInputFast();
      }
    };

    const textArea = textAreaRef?.current;
    if (textArea) {
      textArea.addEventListener('input', eventListener);
    }

    return () => {
      if (textArea) {
        textArea.removeEventListener('input', eventListener);
      }
      handleInputFast.cancel();
      handleInputSlow.cancel();
    };
  }, [conversationId, saveDrafts, textAreaRef]);

  const prevConversationIdRef = useRef<string | null>(null);

  useEffect(() => {
    // This useEffect is responsible for saving the current conversation's draft and
    // restoring the new conversation's draft when switching between conversations.
    // It handles both text and file drafts, ensuring that the user's input is preserved
    // across different conversations.

    if (!saveDrafts || conversationId == null || conversationId === '') {
      return;
    }
    if (conversationId === currentConversationId) {
      return;
    }

    // clear attachment files when switching conversation
    setFiles(new Map());

    try {
      // Check for transition from PENDING_CONVO to a valid conversationId.
      // An ask-answer key is excluded: it is a temporary overlay, not the
      // pending draft's destination — migrating would delete the very draft
      // the answer-phase swap-back is supposed to restore.
      if (
        prevConversationIdRef.current === Constants.PENDING_CONVO &&
        conversationId !== Constants.PENDING_CONVO &&
        !isAskAnswerDraftId(conversationId) &&
        conversationId.length > 3
      ) {
        const pendingDraft = localStorage.getItem(
          `${LocalStorageKeys.TEXT_DRAFT}${Constants.PENDING_CONVO}`,
        );

        // Clear the pending text draft, if it exists, and save the current draft to the new conversationId;
        // otherwise, save the current text area value to the new conversationId
        localStorage.removeItem(`${LocalStorageKeys.TEXT_DRAFT}${Constants.PENDING_CONVO}`);
        if (pendingDraft) {
          localStorage.setItem(`${LocalStorageKeys.TEXT_DRAFT}${conversationId}`, pendingDraft);
        } else if (textAreaRef?.current?.value) {
          setDraft({ id: conversationId, value: textAreaRef.current.value });
        }
        const pendingFileDraft = localStorage.getItem(
          `${LocalStorageKeys.FILES_DRAFT}${Constants.PENDING_CONVO}`,
        );

        if (pendingFileDraft) {
          localStorage.setItem(
            `${LocalStorageKeys.FILES_DRAFT}${conversationId}`,
            pendingFileDraft,
          );
          localStorage.removeItem(`${LocalStorageKeys.FILES_DRAFT}${Constants.PENDING_CONVO}`);
        }
      } else if (currentConversationId != null && currentConversationId) {
        saveText(currentConversationId);
      }

      const pendingPastes = restoreFiles(conversationId);
      restoreText(conversationId, pendingPastes);
    } catch (e) {
      console.error(e);
    }

    prevConversationIdRef.current = conversationId;
    setCurrentConversationId(conversationId);
  }, [
    currentConversationId,
    conversationId,
    restoreFiles,
    textAreaRef,
    restoreText,
    saveDrafts,
    saveText,
    setFiles,
  ]);

  useEffect(() => {
    if (
      !saveDrafts ||
      conversationId == null ||
      conversationId === '' ||
      currentConversationId !== conversationId ||
      fileList == null
    ) {
      return;
    }

    const pendingPastes = restoreFiles(conversationId);
    if (pendingPastes.length > 0) {
      restoreText(conversationId, pendingPastes);
    }
  }, [conversationId, currentConversationId, fileList, restoreFiles, restoreText, saveDrafts]);

  useEffect(() => {
    // This useEffect is responsible for saving or removing the current conversation's file drafts
    // in localStorage whenever the file attachments change.
    // It ensures that the file drafts are kept up-to-date and can be restored
    // when the conversation is revisited.

    if (
      !saveDrafts ||
      conversationId == null ||
      conversationId === '' ||
      currentConversationId !== conversationId
    ) {
      return;
    }

    const existingDraft = getFilesDraft(conversationId);
    const pendingFileIds = Object.keys(existingDraft.pendingPastes);
    const draftFileIds = [
      ...fileIds,
      ...pendingFileIds.filter((fileId) => !fileIds.includes(fileId)),
    ];
    setFilesDraft(conversationId, {
      fileIds: draftFileIds,
      pendingPastes: existingDraft.pendingPastes,
    });
  }, [conversationId, saveDrafts, currentConversationId, fileIds]);
};
