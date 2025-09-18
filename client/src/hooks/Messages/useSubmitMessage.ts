import { v4 } from 'uuid';
import { useCallback, useMemo } from 'react';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import { Constants, replaceSpecialVars } from 'librechat-data-provider';
import type { AgentToolResources, TFile } from 'librechat-data-provider';
import { useChatContext, useChatFormContext, useAddedChatContext } from '~/Providers';
import useUpdateFiles from '~/hooks/Files/useUpdateFiles';
import { useAuthContext } from '~/hooks/AuthContext';
import { useGetFiles } from '~/data-provider';
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

  const fileMap = useMemo(() => {
    const map: Record<string, TFile> = {};
    if (Array.isArray(allFiles)) {
      allFiles.forEach((file) => {
        if (file.file_id) {
          map[file.file_id] = file;
        }
      });
    }
    return map;
  }, [allFiles]);

  const convertToolResourcesToFiles = useCallback(
    (toolResources: AgentToolResources): ExtendedFile[] => {
      const promptFiles: ExtendedFile[] = [];

      Object.entries(toolResources).forEach(([toolResource, resource]) => {
        if (resource?.file_ids) {
          resource.file_ids.forEach((fileId) => {
            const dbFile = fileMap[fileId];
            if (dbFile) {
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
              promptFiles.push(extendedFile);
            } else {
              console.warn(`File not found in fileMap: ${fileId}`);
            }
          });
        } else {
          console.warn(`No file_ids in resource "${toolResource}"`);
        }
      });

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
      const parsedText = replaceSpecialVars({ text, user });

      if (autoSendPrompts) {
        const promptFiles = toolResources ? convertToolResourcesToFiles(toolResources) : [];
        submitMessage({ text: parsedText, toolResources, files: promptFiles });
        return;
      }

      if (toolResources) {
        const promptFiles = convertToolResourcesToFiles(toolResources);

        promptFiles.forEach((file, _index) => {
          addFile(file);
        });
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
