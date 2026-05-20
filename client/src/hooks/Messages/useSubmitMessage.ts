import { useCallback } from 'react';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import { replaceSpecialVars } from 'librechat-data-provider';
import { useChatContext, useChatFormContext, useAddedChatContext } from '~/Providers';
import { useAuthContext } from '~/hooks/AuthContext';
import { useUpdateFarmerPlatformMutation, useUpdateFarmerLastActiveAt } from '~/data-provider';
import store from '~/store';

export default function useSubmitMessage() {
  const { user } = useAuthContext();
  const methods = useChatFormContext();
  const updateFarmerPlatform = useUpdateFarmerPlatformMutation();
  const { conversation: addedConvo } = useAddedChatContext();
  const { ask, index, getMessages, setMessages, latestMessage } = useChatContext();
  const updateLastActiveAt = useUpdateFarmerLastActiveAt();
  const autoSendPrompts = useRecoilValue(store.autoSendPrompts);
  const setActivePrompt = useSetRecoilState(store.activePromptByIndex(index));

  const submitMessage = useCallback(
    (data?: { text: string }, position?: { latitude: number; longitude: number }) => {
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

      const ua = navigator.userAgent;
      let platform = 'Unknown';
      if (/android/i.test(ua)) platform = 'Android';
      else if (/iphone|ipad|ipod/i.test(ua)) platform = 'iOS';
      else if (/windows/i.test(ua)) platform = 'Windows';
      else if (/macintosh|mac os x/i.test(ua)) platform = 'MacOS';
      else if (/linux/i.test(ua)) platform = 'Linux';
      updateFarmerPlatform.mutate(platform);
      updateLastActiveAt.mutate();
      ask(
        {
          text: data.text,
          position,
        },
        {
          addedConvo: addedConvo ?? undefined,
        },
      );
      methods.reset();
    },
    [ask, methods, addedConvo, setMessages, getMessages, latestMessage, updateFarmerPlatform, updateLastActiveAt],
  );

  const submitPrompt = useCallback(
    (text: string) => {
      const parsedText = replaceSpecialVars({ text, user });
      if (autoSendPrompts) {
        submitMessage({ text: parsedText });
        return;
      }

      const currentText = methods.getValues('text');
      const newText = currentText.trim().length > 1 ? `\n${parsedText}` : parsedText;
      setActivePrompt(newText);
    },
    [autoSendPrompts, submitMessage, setActivePrompt, methods, user],
  );

  return { submitMessage, submitPrompt };
}
