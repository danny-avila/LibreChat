import debounce from 'lodash/debounce';
import { SetterOrUpdater, useRecoilValue } from 'recoil';
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { LocalStorageKeys, Constants } from 'librechat-data-provider';
import type { TFile } from 'librechat-data-provider';
import type { ExtendedFile } from '~/common';
import { useChatFormContext } from '~/Providers';
import { useGetFiles } from '~/data-provider';
import store from '~/store';

const clearDraft = debounce((id?: string | null) => {
  localStorage.removeItem(`${LocalStorageKeys.TEXT_DRAFT}${id ?? ''}`);
}, 2500);

const encodeBase64 = (plainText: string): string => {
  try {
    const textBytes = new TextEncoder().encode(plainText);
    return btoa(String.fromCharCode(...textBytes));
  } catch (e) {
    return '';
  }
};

const decodeBase64 = (base64String: string): string => {
  try {
    const bytes = atob(base64String);
    const uint8Array = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) {
      uint8Array[i] = bytes.charCodeAt(i);
    }
    return new TextDecoder().decode(uint8Array);
  } catch (e) {
    return '';
  }
};

export const useAutoSave = ({
  isSubmitting,
  conversationId: _conversationId,
  textAreaRef,
  setFiles,
  files,
}: {
  isSubmitting?: boolean;
  conversationId?: string | null;
  textAreaRef?: React.RefObject<HTMLTextAreaElement>;
  files: Map<string, ExtendedFile>;
  setFiles: SetterOrUpdater<Map<string, ExtendedFile>>;
}) => {
  // setting for auto-save
  const { setValue } = useChatFormContext();
  const saveDrafts = useRecoilValue<boolean>(store.saveDrafts);
  const conversationId = isSubmitting ? Constants.PENDING_CONVO : _conversationId;

  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const fileIds = useMemo(() => Array.from(files.keys()), [files]);
  const { data: fileList } = useGetFiles<TFile[]>();

  const restoreFiles = useCallback(
    (id: string) => {
      const filesDraft = JSON.parse(
        (localStorage.getItem(`${LocalStorageKeys.FILES_DRAFT}${id}`) ?? '') || '[]',
      ) as string[];

      if (filesDraft.length === 0) {
        setFiles(new Map());
        return;
      }

      // Retrieve files stored in localStorage from files in fileList and set them to `setFiles`
      // If a file is found with `temp_file_id`, use `temp_file_id` as a key in `setFiles`
      filesDraft.forEach((fileId) => {
        const fileData = fileList?.find((f) => f.file_id === fileId);
        const tempFileData = fileList?.find((f) => f.temp_file_id === fileId);
        const { fileToRecover, fileIdToRecover } = fileData
          ? { fileToRecover: fileData, fileIdToRecover: fileId }
          : {
              fileToRecover: tempFileData,
              fileIdToRecover: (tempFileData?.temp_file_id ?? '') || fileId,
            };

        if (fileToRecover) {
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
        }
      });
    },
    [fileList, setFiles],
  );

  const restoreText = useCallback(
    (id: string) => {
      const savedDraft = (localStorage.getItem(`${LocalStorageKeys.TEXT_DRAFT}${id}`) ?? '') || '';
      setValue('text', decodeBase64(savedDraft));
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
        localStorage.setItem(
          `${LocalStorageKeys.TEXT_DRAFT}${id}`,
          encodeBase64(textAreaRef.current.value),
        );
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

    const handleInput = debounce((value: string) => {
      if (value && value.length > 1) {
        localStorage.setItem(
          `${LocalStorageKeys.TEXT_DRAFT}${conversationId}`,
          encodeBase64(value),
        );
      } else {
        localStorage.removeItem(`${LocalStorageKeys.TEXT_DRAFT}${conversationId}`);
      }
    }, 750);

    const eventListener = (e: Event) => {
      const target = e.target as HTMLTextAreaElement;
      handleInput(target.value);
    };

    const textArea = textAreaRef?.current;
    if (textArea) {
      textArea.addEventListener('input', eventListener);
    }

    return () => {
      if (textArea) {
        textArea.removeEventListener('input', eventListener);
      }
      handleInput.cancel();
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
      // Check for transition from PENDING_CONVO to a valid conversationId
      if (
        prevConversationIdRef.current === Constants.PENDING_CONVO &&
        conversationId !== Constants.PENDING_CONVO &&
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
          localStorage.setItem(
            `${LocalStorageKeys.TEXT_DRAFT}${conversationId}`,
            encodeBase64(textAreaRef.current.value),
          );
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
          const filesDraft = JSON.parse(pendingFileDraft || '[]') as string[];
          if (filesDraft.length > 0) {
            restoreFiles(conversationId);
          }
        }
      } else if (currentConversationId != null && currentConversationId) {
        saveText(currentConversationId);
      }

      restoreText(conversationId);
      restoreFiles(conversationId);
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

    if (fileIds.length === 0) {
      localStorage.removeItem(`${LocalStorageKeys.FILES_DRAFT}${conversationId}`);
    } else {
      localStorage.setItem(
        `${LocalStorageKeys.FILES_DRAFT}${conversationId}`,
        JSON.stringify(fileIds),
      );
    }
  }, [files, conversationId, saveDrafts, currentConversationId, fileIds]);
};
