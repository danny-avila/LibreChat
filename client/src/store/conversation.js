import models from './models';
import { atom, selector, useRecoilValue, useSetRecoilState, useResetRecoilState } from 'recoil';
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
    return buildTree(get(messages));
  }
});

const latestMessage = atom({
  key: 'latestMessage',
  default: null
});

const useConversation = () => {
  const modelsFilter = useRecoilValue(models.modelsFilter);
  const setConversation = useSetRecoilState(conversation);
  const setMessages = useSetRecoilState(messages);
  const resetLatestMessage = useResetRecoilState(latestMessage);

  const newConversation = ({ model = null, chatGptLabel = null, promptPrefix = null } = {}) => {
    const getDefaultModel = () => {
      try {
        // try to read latest selected model from local storage
        const lastSelected = JSON.parse(localStorage.getItem('model'));
        const { model: _model, chatGptLabel: _chatGptLabel, promptPrefix: _promptPrefix } = lastSelected;

        if (modelsFilter[_model]) {
          model = _model;
          chatGptLabel = _chatGptLabel;
          promptPrefix = _promptPrefix;
          return;
        }
      } catch (error) {}

      // if anything happens, reset to default model
      if (modelsFilter?.chatgpt) model = 'chatgpt';
      else if (modelsFilter?.bingai) model = 'bingai';
      else if (modelsFilter?.chatgptBrowser) model = 'chatgptBrowser';
      chatGptLabel = null;
      promptPrefix = null;
    };

    if (model === null)
      // get the default model
      getDefaultModel();

    setConversation({
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
    });
    setMessages([]);
    resetLatestMessage();
  };

  return { newConversation };
};

export default {
  conversation,
  messages,
  messagesTree,
  latestMessage,
  useConversation
};
