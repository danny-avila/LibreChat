import { SSE } from './sse';
import resetConvo from './resetConvo';
import { useSelector, useDispatch } from 'react-redux';
import { setNewConvo } from '~/store/convoSlice';
import { setMessages } from '~/store/messageSlice';
import { setSubmitState, setSubmission } from '~/store/submitSlice';
import { setText } from '~/store/textSlice';
import { setError } from '~/store/convoSlice';

const useMessageHandler = () => {
  const dispatch = useDispatch();
  const convo = useSelector((state) => state.convo);
  const { initial } = useSelector((state) => state.models);
  const { messages } = useSelector((state) => state.messages);
  const { model, chatGptLabel, promptPrefix, isSubmitting } = useSelector((state) => state.submit);
  const { text } = useSelector((state) => state.text);
  const { latestMessage, error } = convo;

  const ask = ({ text, parentMessageId=null, conversationId=null, messageId=null}, { isRegenerate=false }={}) => {
    if (error) {
      dispatch(setError(false));
    }

    if (!!isSubmitting || text === '') {
      return;
    }
    
    // this is not a real messageId, it is used as placeholder before real messageId returned
    text = text.trim();
    const fakeMessageId = '11111111-1111-1111-1111-111111111111';
    const isCustomModel = model === 'chatgptCustom' || !initial[model];
    const sender = model === 'chatgptCustom' ? chatGptLabel : model;
    parentMessageId = parentMessageId || latestMessage?.messageId || '00000000-0000-0000-0000-000000000000';
    let currentMessages = messages;
    if (resetConvo(currentMessages, sender)) {
      parentMessageId = '00000000-0000-0000-0000-000000000000';
      conversationId = null;
      dispatch(setNewConvo());
      currentMessages = [];
    }
    const currentMsg = { sender: 'User', text, current: true, isCreatedByUser: true, parentMessageId, conversationId, messageId: fakeMessageId };
    const initialResponse = { sender, text: '', parentMessageId: isRegenerate?messageId:fakeMessageId, messageId: (isRegenerate?messageId:fakeMessageId) + '_', submitting: true };

    const submission = {
      convo,
      isCustomModel,
      message: { 
        ...currentMsg,
        model,
        chatGptLabel,
        promptPrefix,
        overrideParentMessageId: isRegenerate?messageId:null
      },
      messages: currentMessages,
      isRegenerate,
      initialResponse,
      sender,
    };

    console.log('User Input:', text);

    if (isRegenerate) {
      dispatch(setMessages([...currentMessages, initialResponse]));
    } else {
      dispatch(setMessages([...currentMessages, currentMsg, initialResponse]));
      dispatch(setText(''));  
    }
    dispatch(setSubmitState(true));
    dispatch(setSubmission(submission));
  }

  const regenerate = ({ parentMessageId }) => {
    const parentMessage = messages?.find(element => element.messageId == parentMessageId);

    if (parentMessage && parentMessage.isCreatedByUser)
      ask({ ...parentMessage }, { isRegenerate: true })
    else
      console.error('Failed to regenerate the message: parentMessage not found or not created by user.', message);
  }

  const stopGenerating = () => {
    dispatch(setSubmission({}));
  }

  return { ask, regenerate, stopGenerating }
}

export { useMessageHandler };

export default function handleSubmit({
  model,
  text,
  convo,
  messageHandler,
  convoHandler,
  errorHandler,
  chatGptLabel,
  promptPrefix
}) {
  const endpoint = `/api/ask`;
  let payload = { model, text, chatGptLabel, promptPrefix };
  if (convo.conversationId && convo.parentMessageId) {
    payload = {
      ...payload,
      conversationId: convo.conversationId,
      parentMessageId: convo.parentMessageId
    };
  }

  const isBing = model === 'bingai' || model === 'sydney';
  if (isBing && convo.conversationId) {

    payload = {
      ...payload,
      jailbreakConversationId: convo.jailbreakConversationId,
      conversationId: convo.conversationId,
      conversationSignature: convo.conversationSignature,
      clientId: convo.clientId,
      invocationId: convo.invocationId,
    };
  }

  let server = endpoint;
  server = model === 'bingai' ? server + '/bing' : server;
  server = model === 'sydney' ? server + '/sydney' : server;
  
  const events = new SSE(server, {
    payload: JSON.stringify(payload),
    headers: { 'Content-Type': 'application/json' }
  });

  events.onopen = function () {
    console.log('connection is opened');
  };

  events.onmessage = function (e) {
    const data = JSON.parse(e.data);
    let text = data.text || data.response;
    if (data.message) {
      messageHandler(text, events);
    }

    if (data.final) {
      convoHandler(data);
      console.log('final', data);
    } else {
      // console.log('dataStream', data);
    }
  };

  events.onerror = function (e) {
    console.log('error in opening conn.');
    events.close();
    errorHandler(e);
  };

  events.addEventListener('stop', () => {
    // Close the SSE stream
    console.log('stop event received');
    events.close();
  });

  events.stream();
}
