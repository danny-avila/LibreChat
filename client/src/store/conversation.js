import endpoints from './endpoints';
import { useCallback } from 'react';
import {
  atom,
  selector,
  atomFamily,
  useSetRecoilState,
  useResetRecoilState,
  useRecoilCallback
} from 'recoil';
import buildTree from '~/utils/buildTree';
import getDefaultConversation from '~/utils/getDefaultConversation';
import submission from './submission.js';

const conversation = atom({
  key: 'conversation',
  default: null
});

// current messages of the conversation, must be an array
// sample structure
// [{text, sender, messageId, parentMessageId, isCreatedByUser}]
const messages = atom({
  key: 'messages',
  default: []
});

const messagesTree = selector({
  key: 'messagesTree',
  get: ({ get }) => {
    return buildTree(get(messages), false);
  }
});

const latestMessage = atom({
  key: 'latestMessage',
  default: null
});

const messagesSiblingIdxFamily = atomFamily({
  key: 'messagesSiblingIdx',
  default: 0
});

const useConversation = () => {
  const setConversation = useSetRecoilState(conversation);
  const setMessages = useSetRecoilState(messages);
  const setSubmission = useSetRecoilState(submission.submission);
  const resetLatestMessage = useResetRecoilState(latestMessage);

  const _switchToConversation = (
    conversation,
    messages = null,
    preset = null,
    { endpointsConfig = {}, prevConversation = {} }
  ) => {
    let { endpoint = null } = conversation;

    if (endpoint === null)
      // get the default model
      conversation = getDefaultConversation({
        conversation,
        endpointsConfig,
        prevConversation,
        preset
      });

    setConversation(conversation);
    setMessages(messages);
    setSubmission({});
    resetLatestMessage();
  };

  const switchToConversation = useRecoilCallback(
    ({ snapshot }) =>
      async (_conversation, messages = null, preset = null) => {
        const prevConversation = await snapshot.getPromise(conversation);
        const endpointsConfig = await snapshot.getPromise(endpoints.endpointsConfig);
        _switchToConversation(_conversation, messages, preset, {
          endpointsConfig,
          prevConversation
        });
      },
    []
  );

  const newConversation = useCallback((template = {}, preset) => {
    switchToConversation(
      {
        conversationId: 'new',
        title: '首页',
        ...template
      },
      [],
      preset
    );
  }, [switchToConversation]);

  const searchPlaceholderConversation = () => {
    switchToConversation(
      {
        conversationId: 'search',
        title: 'Search'
      },
      []
    );
  };

  return { _switchToConversation, newConversation, switchToConversation, searchPlaceholderConversation };
};

export default {
  conversation,
  messages,
  messagesTree,
  latestMessage,
  messagesSiblingIdxFamily,
  useConversation,
};
