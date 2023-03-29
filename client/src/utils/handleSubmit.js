// import resetConvo from './resetConvo';
// import { useSelector, useDispatch } from 'react-redux';
// import { setNewConvo } from '~/store/convoSlice';
// import { setMessages } from '~/store/messageSlice';
// import { setSubmitState, setSubmission } from '~/store/submitSlice';
// import { setText } from '~/store/textSlice';
// import { setError } from '~/store/convoSlice';
import { v4 } from 'uuid';
import { useRecoilState, useRecoilValue, useSetRecoilState } from 'recoil';

import store from '~/store';

const useMessageHandler = () => {
  // const dispatch = useDispatch();
  // const convo = useSelector((state) => state.convo);
  // const { initial } = useSelector((state) => state.models);
  // const { messages } = useSelector((state) => state.messages);
  // const { model, chatGptLabel, promptPrefix, isSubmitting } = useSelector((state) => state.submit);
  // const { latestMessage, error } = convo;

  const [currentConversation, setCurrentConversation] = useRecoilState(store.conversation) || {};
  const setSubmission = useSetRecoilState(store.submission);
  const isSubmitting = useRecoilValue(store.isSubmitting);

  const latestMessage = useRecoilValue(store.latestMessage);
  const { error } = currentConversation;

  const [messages, setMessages] = useRecoilState(store.messages);

  const ask = (
    { text, parentMessageId = null, conversationId = null, messageId = null },
    { isRegenerate = false } = {}
  ) => {
    if (!!isSubmitting || text === '') {
      return;
    }

    // determine the model to be used
    const { model = null, chatGptLabel = null, promptPrefix = null } = currentConversation;

    // construct the query message
    // this is not a real messageId, it is used as placeholder before real messageId returned
    text = text.trim();
    const fakeMessageId = v4();
    // const isCustomModel = model === 'chatgptCustom' || !initial[model];
    // const sender = model === 'chatgptCustom' ? chatGptLabel : model;
    parentMessageId = parentMessageId || latestMessage?.messageId || '00000000-0000-0000-0000-000000000000';
    let currentMessages = messages;
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
      sender: chatGptLabel || model,
      text: '<span className="result-streaming">█</span>',
      parentMessageId: isRegenerate ? messageId : fakeMessageId,
      messageId: (isRegenerate ? messageId : fakeMessageId) + '_',
      conversationId,
      submitting: true
    };

    const submission = {
      conversation: {
        ...currentConversation,
        conversationId,
        model,
        chatGptLabel,
        promptPrefix
      },
      message: {
        ...currentMsg,
        model,
        chatGptLabel,
        promptPrefix,
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
