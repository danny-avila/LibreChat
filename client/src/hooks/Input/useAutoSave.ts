import debounce from 'lodash/debounce';
import { SetterOrUpdater, useRecoilValue } from 'recoil';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { LocalStorageKeys, TFile } from 'librechat-data-provider';
import type { ExtendedFile } from '~/common';
import { useChatFormContext } from '~/Providers';
import { useGetFiles } from '~/data-provider';
import store from '~/store';

export const useAutoSave = ({
  conversationId,
  textAreaRef,
  files,
  setFiles,
}: {
  conversationId?: string | null;
  textAreaRef: React.RefObject<HTMLTextAreaElement>;
  files: Map<string, ExtendedFile>;
  setFiles: SetterOrUpdater<Map<string, ExtendedFile>>;
}) => {
  // setting for auto-save
  const { setValue } = useChatFormContext();
  const saveDrafts = useRecoilValue<boolean>(store.saveDrafts);

  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const fileIds = useMemo(() => Array.from(files.keys()), [files]);
  const { data: fileList } = useGetFiles<TFile[]>();

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

  const restoreFiles = useCallback(
    (id: string) => {
      const filesDraft = JSON.parse(
        localStorage.getItem(`${LocalStorageKeys.FILES_DRAFT}${id}`) || '[]',
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
          : { fileToRecover: tempFileData, fileIdToRecover: tempFileData?.temp_file_id || fileId };

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
      const savedDraft = localStorage.getItem(`${LocalStorageKeys.TEXT_DRAFT}${id}`) || '';
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
      if (textAreaRef.current.value === '') {
        localStorage.removeItem(`${LocalStorageKeys.TEXT_DRAFT}${id}`);
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
    if (!saveDrafts || !conversationId) {
      return;
    }

    const handleInput = debounce(() => {
      if (textAreaRef.current && textAreaRef.current.value) {
        localStorage.setItem(
          `${LocalStorageKeys.TEXT_DRAFT}${conversationId}`,
          encodeBase64(textAreaRef.current.value),
        );
      } else {
        localStorage.removeItem(`${LocalStorageKeys.TEXT_DRAFT}${conversationId}`);
      }
    }, 1000);

    const textArea = textAreaRef.current;
    if (textArea) {
      textArea.addEventListener('input', handleInput);
    }

    return () => {
      if (textArea) {
        textArea.removeEventListener('input', handleInput);
      }
      handleInput.cancel();
    };
  }, [conversationId, saveDrafts, textAreaRef]);

  useEffect(() => {
    // This useEffect is responsible for saving the current conversation's draft and
    // restoring the new conversation's draft when switching between conversations.
    // It handles both text and file drafts, ensuring that the user's input is preserved
    // across different conversations.

    if (!saveDrafts || !conversationId) {
      return;
    }
    if (conversationId === currentConversationId) {
      return;
    }

    // clear attachment files when switching conversation
    setFiles(new Map());

    try {
      if (currentConversationId) {
        saveText(currentConversationId);
      }

      restoreText(conversationId);
      restoreFiles(conversationId);
    } catch (e) {
      console.error(e);
    }

    setCurrentConversationId(conversationId);
  }, [
    conversationId,
    currentConversationId,
    restoreFiles,
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

    if (!saveDrafts || !conversationId || currentConversationId !== conversationId) {
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

  const clearDraft = useCallback(() => {
    if (conversationId) {
      localStorage.removeItem(`${LocalStorageKeys.TEXT_DRAFT}${conversationId}`);
      localStorage.removeItem(`${LocalStorageKeys.FILES_DRAFT}${conversationId}`);
    }
  }, [conversationId]);

  return { clearDraft };
};
