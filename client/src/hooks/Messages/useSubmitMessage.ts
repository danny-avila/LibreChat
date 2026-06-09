import { useCallback } from 'react';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import { replaceSpecialVars, Constants } from 'librechat-data-provider';
import { useChatContext, useChatFormContext, useAddedChatContext } from '~/Providers';
import { useAuthContext } from '~/hooks/AuthContext';
import { buildBklFilterTag, buildBklQueryEnhanceTag, buildBklReferenceTag } from '~/utils/bklFilter';
import { clearDraftNow } from '~/utils';
import store from '~/store';

export default function useSubmitMessage() {
  const { user } = useAuthContext();
  const methods = useChatFormContext();
  const { conversation: addedConvo } = useAddedChatContext();
  const { conversation, ask, index, getMessages, setMessages } = useChatContext();
  const latestMessage = useRecoilValue(store.latestMessageFamily(index));

  const autoSendPrompts = useRecoilValue(store.autoSendPrompts);
  const periodFilter = useRecoilValue(store.periodFilter);
  const queryEnhance = useRecoilValue(store.queryEnhanceEnabled);
  const setQueryEnhance = useSetRecoilState(store.queryEnhanceEnabled);
  const filterMatters = useRecoilValue(store.filterBklMatters);
  const filterDocs = useRecoilValue(store.filterBklDocs);
  const referenceMatters = useRecoilValue(store.referenceBklMatters);
  const setActivePrompt = useSetRecoilState(store.activePromptByIndex(index));

  const submitMessage = useCallback(
    (data?: { text: string }) => {
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

      const filterMatterUids = filterMatters.map((m) => m.matter_uid);
      const filterDocIds = filterDocs.map((d) => d.doc_id);
      const filterDocLabels = filterDocs.map((d) => d.label);
      const referenceMatterUids = referenceMatters.map((m) => m.matter_uid);
      const filterTag = buildBklFilterTag(
        periodFilter,
        filterMatterUids,
        filterDocIds,
        filterDocLabels,
      );
      const referenceTag = buildBklReferenceTag(referenceMatterUids);
      const enhanceTag = buildBklQueryEnhanceTag(queryEnhance);
      const text = `${enhanceTag}${filterTag}${referenceTag}${data.text}`;

      ask(
        {
          text,
        },
        {
          addedConvo: addedConvo ?? undefined,
        },
      );
      methods.reset();
      methods.setValue('text', '');
      try {
        const currentConvoId = conversation?.conversationId;
        if (currentConvoId && currentConvoId !== Constants.NEW_CONVO) {
          clearDraftNow(currentConvoId);
        }
        clearDraftNow(addedConvo?.conversationId);
        clearDraftNow(Constants.PENDING_CONVO);
        clearDraftNow(Constants.NEW_CONVO);
      } catch {
        // noop
      }
      if (queryEnhance) {
        setQueryEnhance(false);
      }
    },
    [
      ask,
      methods,
      addedConvo,
      conversation,
      setMessages,
      getMessages,
      latestMessage,
      periodFilter,
      queryEnhance,
      setQueryEnhance,
      filterMatters,
      filterDocs,
      referenceMatters,
    ],
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
