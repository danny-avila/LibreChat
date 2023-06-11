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

// current conversation, can be null (need to be fetched from server)
// sample structure
// {
//   conversationId: 'new',
//   title: 'New Chat',
//   user: null,
//   // endpoint: [azureOpenAI, openAI, bingAI, chatGPTBrowser]
//   endpoint: 'azureOpenAI',
//   // for azureOpenAI, openAI, chatGPTBrowser only
//   model: 'gpt-3.5-turbo',
//   // for azureOpenAI, openAI only
//   chatGptLabel: null,
//   promptPrefix: null,
//   temperature: 1,
//   top_p: 1,
//   presence_penalty: 0,
//   frequency_penalty: 0,
//   // for bingAI only
//   jailbreak: false,
//   context: null,
//   systemMessage: null,
//   jailbreakConversationId: null,
//   conversationSignature: null,
//   clientId: null,
//   invocationId: 1,
//   toneStyle: null,
// };

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
        title: 'New Chat',
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
  useConversation
};
