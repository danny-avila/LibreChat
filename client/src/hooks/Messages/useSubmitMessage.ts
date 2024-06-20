import { useCallback } from 'react';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import { useChatContext, useChatFormContext } from '~/Providers';
import { useAuthContext } from '~/hooks/AuthContext';
import { replaceSpecialVars } from '~/utils';
import store from '~/store';

export default function useSubmitMessage(helpers?: { clearDraft?: () => void }) {
  const { user } = useAuthContext();
  const methods = useChatFormContext();
  const { ask, index } = useChatContext();
  const autoSendPrompts = useRecoilValue(store.autoSendPrompts);
  const setActivePrompt = useSetRecoilState(store.activePromptByIndex(index));

  const submitMessage = useCallback(
    (data?: { text: string }) => {
      if (!data) {
        return console.warn('No data provided to submitMessage');
      }
      ask({ text: data.text });
      methods.reset();
      helpers?.clearDraft && helpers.clearDraft();
    },
    [ask, methods, helpers],
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
