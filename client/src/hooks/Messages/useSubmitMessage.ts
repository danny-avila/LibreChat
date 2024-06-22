import { useCallback } from 'react';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import type { TMessage } from 'librechat-data-provider';
import { useChatContext, useChatFormContext, useAddedChatContext } from '~/Providers';
import { useAuthContext } from '~/hooks/AuthContext';
import { replaceSpecialVars } from '~/utils';
import store from '~/store';

export default function useSubmitMessage(helpers?: { clearDraft?: () => void }) {
  const { user } = useAuthContext();
  const methods = useChatFormContext();
  const { ask, index, getMessages } = useChatContext();
  const autoSendPrompts = useRecoilValue(store.autoSendPrompts);
  const activeConvos = useRecoilValue(store.allConversationsSelector);
  const setActivePrompt = useSetRecoilState(store.activePromptByIndex(index));

  const { addedIndex, ask: askAdditional, conversation: addedConvo } = useAddedChatContext();

  const submitMessage = useCallback(
    (data?: { text: string }) => {
      if (!data) {
        return console.warn('No data provided to submitMessage');
      }
      const hasAdded = addedIndex && activeConvos[addedIndex] && addedConvo;
      let rootMessages: TMessage[] | undefined;
      if (hasAdded) {
        rootMessages = getMessages();
      }
      ask({ text: data.text });
      hasAdded && askAdditional({ text: data.text }, { overrideMessages: rootMessages });
      methods.reset();
      helpers?.clearDraft && helpers.clearDraft();
    },
    [addedIndex, activeConvos, addedConvo, ask, askAdditional, methods, helpers, getMessages],
  );

  const submitPrompt = useCallback(
    (text: string) => {
      const parsedText = replaceSpecialVars({ text, user });
      if (autoSendPrompts) {
        submitMessage({ text: parsedText });
        return;
      }

      const currentText = methods.getValues('text');
      const newText = currentText ? `\n${parsedText}` : parsedText;
      setActivePrompt(newText);
    },
    [autoSendPrompts, submitMessage, setActivePrompt, methods, user],
  );

  return { submitMessage, submitPrompt };
}
