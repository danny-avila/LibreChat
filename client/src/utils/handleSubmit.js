import { v4 } from 'uuid';
import { useRecoilState, useRecoilValue, useSetRecoilState } from 'recoil';

import store from '~/store';

const useMessageHandler = () => {
  const currentConversation = useRecoilValue(store.conversation) || {};
  const setSubmission = useSetRecoilState(store.submission);
  const isSubmitting = useRecoilValue(store.isSubmitting);

  const latestMessage = useRecoilValue(store.latestMessage);

  const [messages, setMessages] = useRecoilState(store.messages);

  const ask = (
    { text, parentMessageId = null, conversationId = null, messageId = null },
    { isRegenerate = false } = {}
  ) => {
    if (!!isSubmitting || text === '') {
      return;
    }

    // determine the model to be used
    const { endpoint } = currentConversation;
    let endpointOption = {};
    let responseSender = '';
    if (endpoint === 'azureOpenAI' || endpoint === 'openAI') {
      endpointOption = {
        endpoint,
        model: currentConversation?.model || 'gpt-3.5-turbo',
        chatGptLabel: currentConversation?.chatGptLabel || null,
        promptPrefix: currentConversation?.promptPrefix || null,
        temperature: currentConversation?.temperature || 0.8,
        top_p: currentConversation?.top_p || 1,
        presence_penalty: currentConversation?.presence_penalty || 1
      };
      responseSender = endpointOption.chatGptLabel || 'ChatGPT';
    } else if (endpoint === 'bingAI') {
      endpointOption = {
        endpoint,
        jailbreak: currentConversation?.jailbreak || false,
        jailbreakConversationId: currentConversation?.jailbreakConversationId || null,
        conversationSignature: currentConversation?.conversationSignature || null,
        clientId: currentConversation?.clientId || null,
        invocationId: currentConversation?.invocationId || 1,
        toneStyle: currentConversation?.toneStyle || 'fast',
        suggestions: currentConversation?.suggestions || []
      };
      responseSender = endpointOption.jailbreak ? 'Sydney' : 'BingAI';
    } else if (endpoint === 'chatGPTBrowser') {
      endpointOption = {
        endpoint,
        model: currentConversation?.model || 'text-davinci-002-render-sha'
      };
      responseSender = 'ChatGPT';
    } else if (endpoint === null) {
      console.error('No endpoint available');
      return;
    } else {
      console.error(`Unknown endpoint ${endpoint}`);
      return;
    }

    let currentMessages = messages;

    // construct the query message
    // this is not a real messageId, it is used as placeholder before real messageId returned
    text = text.trim();
    const fakeMessageId = v4();
    parentMessageId = parentMessageId || latestMessage?.messageId || '00000000-0000-0000-0000-000000000000';
    conversationId = conversationId || currentConversation?.conversationId;
    if (conversationId == 'search') {
      console.error('cannot send any message under search view!');
      return;
    }
    if (conversationId == 'new') {
      parentMessageId = '00000000-0000-0000-0000-000000000000';
      currentMessages = [];
      conversationId = null;
    }
    const currentMsg = {
      sender: 'User',
      text,
      current: true,
      isCreatedByUser: true,
      parentMessageId,
      conversationId,
      messageId: fakeMessageId
    };

    // construct the placeholder response message
    const initialResponse = {
      sender: responseSender,
      text: '<span className="result-streaming">█</span>',
      parentMessageId: isRegenerate ? messageId : fakeMessageId,
      messageId: (isRegenerate ? messageId : fakeMessageId) + '_',
      conversationId,
      submitting: true
    };

    const submission = {
      conversation: {
        ...currentConversation,
        conversationId
      },
      endpointOption,
      message: {
        ...currentMsg,
        overrideParentMessageId: isRegenerate ? messageId : null
      },
      messages: currentMessages,
      isRegenerate,
      initialResponse
    };

    console.log('User Input:', text);

    if (isRegenerate) {
      setMessages([...currentMessages, initialResponse]);
    } else {
      setMessages([...currentMessages, currentMsg, initialResponse]);
    }
    setSubmission(submission);
  };

  const regenerate = ({ parentMessageId }) => {
    const parentMessage = messages?.find(element => element.messageId == parentMessageId);

    if (parentMessage && parentMessage.isCreatedByUser) ask({ ...parentMessage }, { isRegenerate: true });
    else console.error('Failed to regenerate the message: parentMessage not found or not created by user.');
  };

  const stopGenerating = () => {
    setSubmission(null);
  };

  return { ask, regenerate, stopGenerating };
};

export { useMessageHandler };
