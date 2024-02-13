import { v4 } from 'uuid';
import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { QueryKeys } from 'librechat-data-provider';
import { useRecoilState, useResetRecoilState, useSetRecoilState } from 'recoil';
import type { TMessage } from 'librechat-data-provider';
import type { TAskFunction } from '~/common';
import useNewConvo from './useNewConvo';
import store from '~/store';
import { useAuthStore } from '~/zustand';
import { fetchEventSource } from '@microsoft/fetch-event-source';
import { VERA_HEADER } from '~/utils/constants';
import { useNavigate } from 'react-router-dom';

const EVENT_TYPES = {
  PROCESS_PROMPT: 'process_prompt',
  ROUTE_PROMPT: 'route_prompt',
  GENERATE_RESPONSE: 'generate_response',
  PROCESS_RESPONSE: 'process_response',
  MESSAGE: 'message',
  INIT_CONVERSATION: 'init_conversation',
};

// this to be set somewhere else
export default function useVeraChat(index = 0, paramId: string | undefined) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { token, user } = useAuthStore();
  const [abortController, setAbortController] = useState(new AbortController());
  const [showStopButton, setShowStopButton] = useState(false);

  const [currEvent, setCurrEvent] = useRecoilState(store.eventMessageByIndex(index));
  const [isSubmitting, setIsSubmitting] = useRecoilState(store.isSubmittingFamily(index));
  const [latestMessage, setLatestMessage] = useRecoilState(store.latestMessageFamily(index));

  const [files, setFiles] = useRecoilState(store.filesByIndex(index));
  const [filesLoading, setFilesLoading] = useState(false);

  const { newConversation } = useNewConvo(index);
  const { useCreateConversationAtom } = store;
  const { conversation, setConversation } = useCreateConversationAtom(index);
  const { conversationId } = conversation ?? {};

  const queryParam = paramId === 'new' ? paramId : conversationId ?? paramId ?? '';

  const resetLatestMessage = useResetRecoilState(store.latestMessageFamily(index));
  const setSiblingIdx = useSetRecoilState(
    store.messagesSiblingIdxFamily(latestMessage?.parentMessageId ?? null),
  );

  const setMessages = useCallback(
    (messages: TMessage[]) => {
      queryClient.setQueryData<TMessage[]>([QueryKeys.messages, queryParam], messages);
    },
    [queryParam, queryClient],
  );

  const getMessages = useCallback(() => {
    return queryClient.getQueryData<TMessage[]>([QueryKeys.messages, queryParam]);
  }, [queryParam, queryClient]);

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
    const messages = getMessages() ?? [];
    const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;

    console.log(conversation);
    setShowStopButton(true);
    setIsSubmitting(true);
    setCurrEvent('Starting');

    const tempMessage = {
      text: text.trim(),
      sender: user?.username,
      isCreatedByUser: true,
      parentMessageId: parentMessageId ?? lastMessage?.messageId ?? null,
      conversationId: conversationId ?? lastMessage?.conversationId ?? null,
      messageId: 'tempMessage',
      error: false,
    };
    setMessages([...messages, tempMessage]);

    const apiUrl = 'https://dev-app.askvera.io/api/v1/chat';
    const apiKey = token!;
    const payload = {
      prompt_text: text.trim(),
      conversation_id: conversation?.conversation_id ?? null,
    };
    const headers = {
      'Content-Type': 'application/json',
      [VERA_HEADER]: apiKey,
    };
    console.log(`[PROTO] ESTABLISHING CONNECTION WITH TOKEN: \n${apiKey}\n and PROMPT: \n${text}`);

    fetchEventSource(apiUrl, {
      method: 'POST',
      headers,
      signal: abortController.signal,
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
        //console.log('[PROTO] NEW EVENT:', msg);
        if (msg.data) {
          const data = JSON.parse(msg.data);
          //console.log('[PROTO] EVENT DATA:', data);
          processEventMessage(data);
        }
        if (msg.event === 'FatalError') throw new Error(msg.data);
      },
      onerror(e) {
        abortController.abort();
        setAbortController(new AbortController());
        setCurrEvent('');
        setShowStopButton(false);
        setIsSubmitting(false);
        console.log('[PROTO] ERROR: ', e);
        throw Error(e);
      },
      onclose() {
        setCurrEvent('');
        setShowStopButton(false);
        setIsSubmitting(false);
        console.log('[PROTO] CONNECTION CLOSED');
      },
    });
  };

  const processEventMessage = (data) => {
    let currentMessages: TMessage[] | null = getMessages() ?? [];
    switch (data.event_type) {
      case EVENT_TYPES.INIT_CONVERSATION:
        setConversation(data.event);
      case EVENT_TYPES.PROCESS_PROMPT:
        setCurrEvent('Processing Prompt');
        console.log(EVENT_TYPES.PROCESS_PROMPT, ':', data);
        break;
      case EVENT_TYPES.ROUTE_PROMPT:
        setCurrEvent('Routing Prompt');
        console.log(EVENT_TYPES.ROUTE_PROMPT, ':', data);
        break;
      case EVENT_TYPES.GENERATE_RESPONSE:
        setCurrEvent('Generating Response');
        console.log(EVENT_TYPES.GENERATE_RESPONSE, ':', data);
        break;
      case EVENT_TYPES.PROCESS_RESPONSE:
        setCurrEvent('Processing Response');
        console.log(EVENT_TYPES.PROCESS_RESPONSE, ':', data);
        break;
      case EVENT_TYPES.MESSAGE:
        console.log('message: ', data);
        const { body, is_user_created, parent_message_id, message_id } = data.event;
        const { conversation_id, is_error } = data;

        const msg = {
          text: body,
          sender: is_user_created ? user?.username : 'Vera',
          isCreatedByUser: is_user_created,
          parentMessageId: parent_message_id,
          conversationId: conversation_id,
          messageId: message_id,
          error: is_error,
        };

        if (!is_user_created) {
          const {
            policy_message,
            system_message,
            selected_model = 'Sample Model',
            selected_model_reason = 'Sample Reason: Lorem Ipsum Genuar Jaguar Lem Ip Su onpunm Delra gris',
          } = data.event;

          msg.model = selected_model;
          msg.modelReason = selected_model_reason;
          msg.policyMessage = policy_message;
          msg.systemMessage = system_message;

          setMessages([...currentMessages, msg]);
        } else {
          const tempMsgIndex = currentMessages.findIndex((msg) => msg.messageId === 'tempMessage');
          currentMessages[tempMsgIndex] = msg;

          setMessages([...currentMessages]);
        }

        setLatestMessage(msg);
      default:
        console.log('uncaught event: ', data);
    }
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
    abortController.abort();
    setAbortController(new AbortController());
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

    currEvent,
    setCurrEvent,
    ask,
    showStopButton,
    setShowStopButton,
  };
}
