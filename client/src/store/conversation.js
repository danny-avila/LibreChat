import models from './models';
import { atom, selector, useSetRecoilState, useResetRecoilState, useRecoilCallback } from 'recoil';
import buildTree from '~/utils/buildTree';

// current conversation, can be null (need to be fetched from server)
// sample structure
// {
//   conversationId: "new",
//   title: "New Chat",
//   jailbreakConversationId: null,
//   conversationSignature: null,
//   clientId: null,
//   invocationId: null,
//   model: "chatgpt",
//   chatGptLabel: null,
//   promptPrefix: null,
//   user: null,
//   suggestions: [],
//   toneStyle: null,
// }
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
      async (_conversation, messages = null) => {
        const prevConversation = await snapshot.getPromise(conversation);
        const prevModelsFilter = await snapshot.getPromise(models.modelsFilter);
        _switchToConversation(_conversation, messages, { prevModelsFilter, prevConversation });
      },
    []
  );

  const _switchToConversation = (
    conversation,
    messages = null,
    { prevModelsFilter = {}, prev_conversation = {} }
  ) => {
    let { model = null, chatGptLabel = null, promptPrefix = null } = conversation;
    const getDefaultModel = () => {
      try {
        // try to use current model
        const { _model = null, _chatGptLabel = null, _promptPrefix = null } = prev_conversation || {};
        if (prevModelsFilter[_model]) {
          model = _model;
          chatGptLabel = _chatGptLabel;
          promptPrefix = _promptPrefix;
          return;
        }
      } catch (error) {}

      try {
        // try to read latest selected model from local storage
        const lastSelected = JSON.parse(localStorage.getItem('model'));
        const { model: _model, chatGptLabel: _chatGptLabel, promptPrefix: _promptPrefix } = lastSelected;

        if (prevModelsFilter[_model]) {
          model = _model;
          chatGptLabel = _chatGptLabel;
          promptPrefix = _promptPrefix;
          return;
        }
      } catch (error) {}

      // if anything happens, reset to default model
      if (prevModelsFilter?.chatgpt) model = 'chatgpt';
      else if (prevModelsFilter?.bingai) model = 'bingai';
      else if (prevModelsFilter?.chatgptBrowser) model = 'chatgptBrowser';
      chatGptLabel = null;
      promptPrefix = null;
    };

    if (model === null)
      // get the default model
      getDefaultModel();

    setConversation({
      ...conversation,
      model: model,
      chatGptLabel: chatGptLabel,
      promptPrefix: promptPrefix
    });
    setMessages(messages);
    resetLatestMessage();
  };

  const newConversation = ({ model = null, chatGptLabel = null, promptPrefix = null } = {}) => {
    switchToConversation(
      {
        conversationId: 'new',
        title: 'New Chat',
        jailbreakConversationId: null,
        conversationSignature: null,
        clientId: null,
        invocationId: null,
        model: model,
        chatGptLabel: chatGptLabel,
        promptPrefix: promptPrefix,
        user: null,
        suggestions: [],
        toneStyle: null
      },
      []
    );
  };

  const searchPlaceholderConversation = () => {
    switchToConversation(
      {
        conversationId: 'search',
        title: 'Search',
        jailbreakConversationId: null,
        conversationSignature: null,
        clientId: null,
        invocationId: null,
        model: null,
        chatGptLabel: null,
        promptPrefix: null,
        user: null,
        suggestions: [],
        toneStyle: null
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
