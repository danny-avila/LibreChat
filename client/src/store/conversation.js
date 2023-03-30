import endpoints from './endpoints';
import { atom, selector, useSetRecoilState, useResetRecoilState, useRecoilCallback } from 'recoil';
import buildTree from '~/utils/buildTree';
import getDefaultConversation from '~/utils/getDefaultConversation';

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
//   temperature: 0.8,
//   top_p: 1,
//   presence_penalty: 1,
//   // for bingAI only
//   jailbreak: false,
//   jailbreakConversationId: null,
//   conversationSignature: null,
//   clientId: null,
//   invocationId: 1,
//   toneStyle: null,
//   suggestions: []
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

const useConversation = () => {
  const setConversation = useSetRecoilState(conversation);
  const setMessages = useSetRecoilState(messages);
  const resetLatestMessage = useResetRecoilState(latestMessage);

  const switchToConversation = useRecoilCallback(
    ({ snapshot }) =>
      async (_conversation, messages = null, targetEndpoint = null) => {
        const prevConversation = await snapshot.getPromise(conversation);
        const endpointsFilter = await snapshot.getPromise(endpoints.endpointsFilter);
        _switchToConversation(_conversation, messages, targetEndpoint, {
          endpointsFilter,
          prevConversation
        });
      },
    []
  );

  const _switchToConversation = (
    conversation,
    messages = null,
    targetEndpoint = null,
    { endpointsFilter = {}, prevConversation = {} }
  ) => {
    let { endpoint = null } = conversation;

    if (endpoint === null)
      // get the default model
      conversation = getDefaultConversation({
        conversation,
        endpointsFilter,
        prevConversation,
        targetEndpoint
      });

    setConversation(conversation);
    setMessages(messages);
    resetLatestMessage();
  };

  const newConversation = (template = {}, targetEndpoint = null) => {
    switchToConversation(
      {
        conversationId: 'new',
        title: 'New Chat',
        ...template
      },
      [],
      targetEndpoint
    );
  };

  const searchPlaceholderConversation = () => {
    switchToConversation(
      {
        conversationId: 'search',
        title: 'Search'
      },
      []
    );
  };

  return { newConversation, switchToConversation, searchPlaceholderConversation };
};

export default {
  conversation,
  messages,
  messagesTree,
  latestMessage,
  useConversation
};
