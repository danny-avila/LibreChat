import { v4 } from 'uuid';
import { useRecoilState, useRecoilValue, useSetRecoilState } from 'recoil';
import { parseConvo, getResponseSender } from 'librechat-data-provider';
import type { TMessage } from 'librechat-data-provider';
import store from '~/store';

type AskProps = {
  text: string;
  parentMessageId?: string | null;
  conversationId?: string | null;
  messageId?: string | null;
};

const useMessageHandler = () => {
  const currentConversation = useRecoilValue(store.conversation) || { endpoint: null };
  const setSubmission = useSetRecoilState(store.submission);
  const isSubmitting = useRecoilValue(store.isSubmitting);
  const endpointsConfig = useRecoilValue(store.endpointsConfig);
  const latestMessage = useRecoilValue(store.latestMessage);
  const [messages, setMessages] = useRecoilState(store.messages);
  const { endpoint } = currentConversation;
  const { getToken } = store.useToken(endpoint ?? '');

  const ask = (
    { text, parentMessageId = null, conversationId = null, messageId = null }: AskProps,
    { isRegenerate = false } = {},
  ) => {
    if (!!isSubmitting || text === '') {
      return;
    }

    if (endpoint === null) {
      console.error('No endpoint available');
      return;
    }

    const { userProvide } = endpointsConfig[endpoint] || {};

    // set the endpoint option
    const convo = parseConvo(endpoint, currentConversation);
    const endpointOption = {
      endpoint,
      ...convo,
      token: userProvide ? getToken() : null,
    };
    const responseSender = getResponseSender(endpointOption);

    let currentMessages: TMessage[] | null = messages;

    // construct the query message
    // this is not a real messageId, it is used as placeholder before real messageId returned
    text = text.trim();
    const fakeMessageId = v4();
    parentMessageId =
      parentMessageId || latestMessage?.messageId || '00000000-0000-0000-0000-000000000000';
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
    const currentMsg: TMessage = {
      sender: 'User',
      text,
      current: true,
      isCreatedByUser: true,
      parentMessageId,
      conversationId,
      messageId: fakeMessageId,
      clientId: '',
      error: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // construct the placeholder response message
    const initialResponse: TMessage = {
      sender: responseSender,
      text: '<span className="result-streaming">█</span>',
      parentMessageId: isRegenerate ? messageId : fakeMessageId,
      messageId: (isRegenerate ? messageId : fakeMessageId) + '_',
      conversationId,
      unfinished: false,
      submitting: true,
      clientId: '',
      isCreatedByUser: false,
      error: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const submission = {
      conversation: {
        ...currentConversation,
        conversationId,
      },
      endpointOption,
      message: {
        ...currentMsg,
        overrideParentMessageId: isRegenerate ? messageId : null,
      },
      messages: currentMessages,
      isRegenerate,
      initialResponse,
    };

    console.log('User Input:', text, submission);

    if (isRegenerate) {
      setMessages([...(currentMessages ?? []), initialResponse]);
    } else {
      setMessages([...(currentMessages ?? []), currentMsg, initialResponse]);
    }
    setSubmission(submission);
  };

  const regenerate = ({ parentMessageId }) => {
    const parentMessage = messages?.find((element) => element.messageId == parentMessageId);

    if (parentMessage && parentMessage.isCreatedByUser) {
      ask({ ...parentMessage }, { isRegenerate: true });
    } else {
      console.error(
        'Failed to regenerate the message: parentMessage not found or not created by user.',
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
    const parentMessageId = messages?.[messages.length - 1]?.parentMessageId;
    if (!parentMessageId) {
      console.error('Failed to regenerate the message: parentMessageId not found.');
      return;
    }
    regenerate({ parentMessageId });
  };

  return {
    ask,
    regenerate,
    stopGenerating,
    handleStopGenerating,
    handleRegenerate,
    endpointsConfig,
    latestMessage,
    isSubmitting,
    messages,
  };
};

export default useMessageHandler;
