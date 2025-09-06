import { v4 } from 'uuid';
import { useCallback, useMemo } from 'react';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import { Constants, replaceSpecialVars } from 'librechat-data-provider';
import type { AgentToolResources, TFile } from 'librechat-data-provider';
import { useChatContext, useChatFormContext, useAddedChatContext } from '~/Providers';
import { useAuthContext } from '~/hooks/AuthContext';
import { useGetFiles } from '~/data-provider';
import useUpdateFiles from '~/hooks/Files/useUpdateFiles';
import type { ExtendedFile } from '~/common';
import store from '~/store';

const appendIndex = (index: number, value?: string) => {
  if (!value) {
    return value;
  }
  return `${value}${Constants.COMMON_DIVIDER}${index}`;
};

export default function useSubmitMessage() {
  const { user } = useAuthContext();
  const methods = useChatFormContext();
  const { ask, index, getMessages, setMessages, latestMessage, setFiles } = useChatContext();
  const { addedIndex, ask: askAdditional, conversation: addedConvo } = useAddedChatContext();
  const { data: allFiles = [] } = useGetFiles();
  const { addFile } = useUpdateFiles(setFiles);

  const autoSendPrompts = useRecoilValue(store.autoSendPrompts);
  const activeConvos = useRecoilValue(store.allConversationsSelector);
  const setActivePrompt = useSetRecoilState(store.activePromptByIndex(index));

  // Create a fileMap for quick lookup
  const fileMap = useMemo(() => {
    const map: Record<string, TFile> = {};
    allFiles.forEach((file) => {
      if (file.file_id) {
        map[file.file_id] = file;
      }
    });
    return map;
  }, [allFiles]);

  // Convert toolResources to ExtendedFile objects for chat UI
  const convertToolResourcesToFiles = useCallback(
    (toolResources: AgentToolResources): ExtendedFile[] => {
      console.log('convertToolResourcesToFiles called with:', toolResources);
      console.log('Available fileMap keys:', Object.keys(fileMap));

      const promptFiles: ExtendedFile[] = [];

      Object.entries(toolResources).forEach(([toolResource, resource]) => {
        console.log(`Processing toolResource "${toolResource}":`, resource);
        if (resource?.file_ids) {
          console.log(`Found ${resource.file_ids.length} file_ids:`, resource.file_ids);
          resource.file_ids.forEach((fileId) => {
            const dbFile = fileMap[fileId];
            console.log(`Looking up fileId "${fileId}":`, dbFile ? 'FOUND' : 'NOT FOUND');
            if (dbFile) {
              console.log('Database file details:', {
                file_id: dbFile.file_id,
                filename: dbFile.filename,
                type: dbFile.type,
                bytes: dbFile.bytes,
                width: dbFile.width,
                height: dbFile.height,
                hasWidthHeight: !!(dbFile.width && dbFile.height),
              });
              const extendedFile = {
                file_id: dbFile.file_id,
                temp_file_id: dbFile.file_id,
                filename: dbFile.filename,
                filepath: dbFile.filepath,
                type: dbFile.type,
                size: dbFile.bytes,
                width: dbFile.width,
                height: dbFile.height,
                progress: 1, // Already uploaded
                attached: true,
                tool_resource: toolResource,
                preview: dbFile.type?.startsWith('image/') ? dbFile.filepath : undefined,
              };
              console.log('✅ Created ExtendedFile:', extendedFile);
              promptFiles.push(extendedFile);
            } else {
              console.warn(`File not found in fileMap: ${fileId}`);
            }
          });
        } else {
          console.log(`⚠️ No file_ids in resource "${toolResource}"`);
        }
      });

      console.log(
        `convertToolResourcesToFiles returning ${promptFiles.length} files:`,
        promptFiles,
      );
      return promptFiles;
    },
    [fileMap],
  );

  const submitMessage = useCallback(
    (data?: { text: string; toolResources?: AgentToolResources; files?: ExtendedFile[] }) => {
      if (!data) {
        return console.warn('No data provided to submitMessage');
      }
      const rootMessages = getMessages();
      const isLatestInRootMessages = rootMessages?.some(
        (message) => message.messageId === latestMessage?.messageId,
      );
      if (!isLatestInRootMessages && latestMessage) {
        setMessages([...(rootMessages || []), latestMessage]);
      }

      const hasAdded = addedIndex && activeConvos[addedIndex] && addedConvo;
      const isNewMultiConvo =
        hasAdded &&
        activeConvos.every((convoId) => convoId === Constants.NEW_CONVO) &&
        !rootMessages?.length;
      const overrideConvoId = isNewMultiConvo ? v4() : undefined;
      const overrideUserMessageId = hasAdded ? v4() : undefined;
      const rootIndex = addedIndex - 1;
      const clientTimestamp = new Date().toISOString();

      console.log('submitMessage calling ask with:', {
        text: data.text?.substring(0, 100) + '...',
        toolResources: data.toolResources,
        overrideFiles: data.files,
        hasOverrideFiles: !!data.files?.length,
      });

      ask(
        {
          text: data.text,
          overrideConvoId: appendIndex(rootIndex, overrideConvoId),
          overrideUserMessageId: appendIndex(rootIndex, overrideUserMessageId),
          clientTimestamp,
          toolResources: data.toolResources,
        },
        {
          overrideFiles: data.files,
        },
      );

      if (hasAdded) {
        askAdditional(
          {
            text: data.text,
            overrideConvoId: appendIndex(addedIndex, overrideConvoId),
            overrideUserMessageId: appendIndex(addedIndex, overrideUserMessageId),
            clientTimestamp,
            toolResources: data.toolResources,
          },
          {
            overrideMessages: rootMessages,
            overrideFiles: data.files,
          },
        );
      }
      methods.reset();
    },
    [
      ask,
      methods,
      addedIndex,
      addedConvo,
      setMessages,
      getMessages,
      activeConvos,
      askAdditional,
      latestMessage,
    ],
  );

  const submitPrompt = useCallback(
    (text: string, toolResources?: AgentToolResources) => {
      console.log('useSubmitMessage.submitPrompt called:', {
        text: text?.substring(0, 100) + '...',
        toolResources,
        hasToolResources: !!toolResources,
        autoSendPrompts,
      });

      const parsedText = replaceSpecialVars({ text, user });

      if (autoSendPrompts) {
        console.log('Auto-sending message with toolResources');
        // Auto-send: convert toolResources to files and pass both
        const promptFiles = toolResources ? convertToolResourcesToFiles(toolResources) : [];
        console.log('Auto-send converted files:', promptFiles);
        submitMessage({ text: parsedText, toolResources, files: promptFiles });
        return;
      }

      // Manual mode: add files to chat state so they appear in UI
      if (toolResources) {
        console.log('Converting toolResources to files for manual mode...');
        const promptFiles = convertToolResourcesToFiles(toolResources);
        console.log('Converted files:', promptFiles);

        // Add files to chat state so they appear in UI (same as AttachFileMenu)
        promptFiles.forEach((file, index) => {
          console.log(`Adding file ${index + 1}/${promptFiles.length}:`, {
            file_id: file.file_id,
            filename: file.filename,
            type: file.type,
            size: file.size,
          });
          addFile(file);
        });
        console.log('All files added to chat state');
      } else {
        console.log('No toolResources provided');
      }

      const currentText = methods.getValues('text');
      const newText = currentText.trim().length > 1 ? `\n${parsedText}` : parsedText;
      setActivePrompt(newText);
    },
    [
      autoSendPrompts,
      submitMessage,
      setActivePrompt,
      methods,
      user,
      addFile,
      convertToolResourcesToFiles,
    ],
  );

  return { submitMessage, submitPrompt };
}
