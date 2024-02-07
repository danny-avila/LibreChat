import { v4 } from 'uuid';
import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { QueryKeys, parseCompactConvo } from 'librechat-data-provider';
import { useRecoilState, useResetRecoilState, useSetRecoilState } from 'recoil';
import { useGetMessagesByConvoId, useGetEndpointsQuery } from 'librechat-data-provider/react-query';
import type {
  TMessage,
  TSubmission,
  TEndpointOption,
  TEndpointsConfig,
} from 'librechat-data-provider';
import type { TAskFunction } from '~/common';
import useSetFilesToDelete from './useSetFilesToDelete';
import useGetSender from './Conversations/useGetSender';
import useUserKey from './Input/useUserKey';
import useNewConvo from './useNewConvo';
import store from '~/store';
import { useAuthStore } from '~/zustand';
import { fetchEventSource } from '@microsoft/fetch-event-source';
import { VERA_HEADER } from '~/utils/constants';

// this to be set somewhere else
export default function useVeraChat(index = 0, paramId: string | undefined) {
  const { data: endpointsConfig = {} as TEndpointsConfig } = useGetEndpointsQuery();
  const [files, setFiles] = useRecoilState(store.filesByIndex(index));
  const [showStopButton, setShowStopButton] = useState(true);
  const [filesLoading, setFilesLoading] = useState(false);
  const setFilesToDelete = useSetFilesToDelete();
  const getSender = useGetSender();

  const queryClient = useQueryClient();
  const { isAuthenticated, token } = useAuthStore();

  const { newConversation } = useNewConvo(index);
  const { useCreateConversationAtom } = store;
  const { conversation, setConversation } = useCreateConversationAtom(index);
  const { conversationId, endpoint, endpointType } = conversation ?? {};

  const queryParam = paramId === 'new' ? paramId : conversationId ?? paramId ?? '';

  /* Messages: here simply to fetch, don't export and use `getMessages()` instead */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { data: _messages } = useGetMessagesByConvoId(conversationId ?? '', {
    enabled: isAuthenticated(),
  });

  const resetLatestMessage = useResetRecoilState(store.latestMessageFamily(index));
  const [isSubmitting, setIsSubmitting] = useRecoilState(store.isSubmittingFamily(index));
  const [latestMessage, setLatestMessage] = useRecoilState(store.latestMessageFamily(index));
  const setSiblingIdx = useSetRecoilState(
    store.messagesSiblingIdxFamily(latestMessage?.parentMessageId ?? null),
  );

  const setMessages = useCallback(
    (messages: TMessage[]) => {
      queryClient.setQueryData<TMessage[]>([QueryKeys.messages, queryParam], messages);
    },
    // [conversationId, queryClient],
    [queryParam, queryClient],
  );

  const getMessages = useCallback(() => {
    return queryClient.getQueryData<TMessage[]>([QueryKeys.messages, queryParam]);
  }, [queryParam, queryClient]);

  /* Conversation */
  // const setActiveConvos = useSetRecoilState(store.activeConversations);

  // const setConversation = useCallback(
  //   (convoUpdate: TConversation) => {
  //     _setConversation(prev => {
  //       const { conversationId: convoId } = prev ?? { conversationId: null };
  //       const { conversationId: currentId } = convoUpdate;
  //       if (currentId && convoId && convoId !== 'new' && convoId !== currentId) {
  //         // for now, we delete the prev convoId from activeConversations
  //         const newActiveConvos = { [currentId]: true };
  //         setActiveConvos(newActiveConvos);
  //       }
  //       return convoUpdate;
  //     });
  //   },
  //   [_setConversation, setActiveConvos],
  // );
  const { getExpiry } = useUserKey(endpoint ?? '');
  const setSubmission = useSetRecoilState(store.submissionByIndex(index));

  const ask: TAskFunction = (
    { text, parentMessageId = null, conversationId = null, messageId = null },
    {
      editedText = null,
      editedMessageId = null,
      isRegenerate = false,
      isContinued = false,
      isEdited = false,
    } = {},
  ) => {
    setShowStopButton(true);

    console.log(`[PROTO] ESTABLISHING CONNECTION WITH TOKEN: \n${token}\n and PROMPT: \n${text}`);
    const apiUrl = 'https://dev-app.askvera.io/api/v1/chat';
    const apiKey = token!;
    const payload = {
      prompt_text: text.trim(),
    };
    const headers = { 'Content-Type': 'application/json', [VERA_HEADER]: apiKey };

    fetchEventSource(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      async onopen(response) {
        console.log('[PROTO] OPENED CONNECTION:', response);
        if (response.ok) {
          return; // everything's good
        } else if (response.status >= 400 && response.status < 500 && response.status !== 429) {
          // client-side errors are usually non-retriable:
          throw new Error();
        } else {
          throw new Error();
        }
      },
      onmessage(msg) {
        console.log('[PROTO] NEW EVENT:', msg);
        if (msg.data) {
          console.log('[PROTO] EVENT DATA:', JSON.parse(msg.data));
          const fakeMessageId = v4();
          let currentMessages: TMessage[] | null = getMessages() ?? [];

          const msgObject = {
            text: msg.data,
            sender: 'User',
            isCreatedByUser: true,
            parentMessageId,
            conversationId,
            messageId: isContinued && messageId ? messageId : fakeMessageId,
            error: false,
          };
          console.log('[PROTO] Current msgs: ', currentMessages);
          setMessages([...currentMessages, msgObject]);
          setLatestMessage(msg);
        }
        if (msg.event === 'FatalError') {
          throw new Error(msg.data);
        }
      },
      onerror(e) {
        console.log('[PROTO] ERROR: ', e);
        throw Error(e);
      },
      onclose() {
        console.log('[PROTO] CONNECTION CLOSED');
      },
    });
  };

  const regenerate = ({ parentMessageId }) => {
    const messages = getMessages();
    const parentMessage = messages?.find((element) => element.messageId == parentMessageId);

    if (parentMessage && parentMessage.isCreatedByUser) {
      ask({ ...parentMessage }, { isRegenerate: true });
    } else {
      console.error(
        'Failed to regenerate the message: parentMessage not found or not created by user.',
      );
    }
  };

  const continueGeneration = () => {
    if (!latestMessage) {
      console.error('Failed to regenerate the message: latestMessage not found.');
      return;
    }

    const messages = getMessages();

    const parentMessage = messages?.find(
      (element) => element.messageId == latestMessage.parentMessageId,
    );

    if (parentMessage && parentMessage.isCreatedByUser) {
      ask({ ...parentMessage }, { isContinued: true, isRegenerate: true, isEdited: true });
    } else {
      console.error(
        'Failed to regenerate the message: parentMessage not found, or not created by user.',
      );
    }
  };

  const stopGenerating = () => {
    setSubmission(null);
  };

  const handleStopGenerating = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    stopGenerating();
  };

  const handleRegenerate = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    const parentMessageId = latestMessage?.parentMessageId;
    if (!parentMessageId) {
      console.error('Failed to regenerate the message: parentMessageId not found.');
      return;
    }
    regenerate({ parentMessageId });
  };

  const handleContinue = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    continueGeneration();
    setSiblingIdx(0);
  };

  const [showBingToneSetting, setShowBingToneSetting] = useRecoilState(
    store.showBingToneSettingFamily(index),
  );
  const [showPopover, setShowPopover] = useRecoilState(store.showPopoverFamily(index));
  const [abortScroll, setAbortScroll] = useRecoilState(store.abortScrollFamily(index));
  const [preset, setPreset] = useRecoilState(store.presetByIndex(index));
  const [optionSettings, setOptionSettings] = useRecoilState(store.optionSettingsFamily(index));
  const [showAgentSettings, setShowAgentSettings] = useRecoilState(
    store.showAgentSettingsFamily(index),
  );

  return {
    newConversation,
    conversation,
    setConversation,
    // getConvos,
    // setConvos,
    isSubmitting,
    setIsSubmitting,
    getMessages,
    setMessages,
    setSiblingIdx,
    latestMessage,
    setLatestMessage,
    resetLatestMessage,
    ask,
    index,
    regenerate,
    stopGenerating,
    handleStopGenerating,
    handleRegenerate,
    handleContinue,
    showPopover,
    setShowPopover,
    abortScroll,
    setAbortScroll,
    showBingToneSetting,
    setShowBingToneSetting,
    preset,
    setPreset,
    optionSettings,
    setOptionSettings,
    showAgentSettings,
    setShowAgentSettings,
    files,
    setFiles,
    filesLoading,
    setFilesLoading,
    showStopButton,
    setShowStopButton,
  };
}
