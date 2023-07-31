import endpoints from './endpoints';
import { useCallback } from 'react';
import {
  atom,
  selector,
  atomFamily,
  useSetRecoilState,
  useResetRecoilState,
  useRecoilCallback,
} from 'recoil';
import buildTree from '~/utils/buildTree';
import getDefaultConversation from '~/utils/getDefaultConversation';
import submission from './submission';
import {
  TConversation,
  TConversationAtom,
  TMessagesAtom,
  TSubmission,
  TPreset,
} from 'librechat-data-provider';

const conversation = atom<TConversationAtom>({
  key: 'conversation',
  default: null,
});

// current messages of the conversation, must be an array
// sample structure
// [{text, sender, messageId, parentMessageId, isCreatedByUser}]
const messages = atom<TMessagesAtom>({
  key: 'messages',
  default: [],
});

const messagesTree = selector({
  key: 'messagesTree',
  get: ({ get }) => {
    return buildTree(get(messages), false);
  },
});

const latestMessage = atom({
  key: 'latestMessage',
  default: null,
});

const messagesSiblingIdxFamily = atomFamily({
  key: 'messagesSiblingIdx',
  default: 0,
});

const useConversation = () => {
  const setConversation = useSetRecoilState(conversation);
  const setMessages = useSetRecoilState<TMessagesAtom>(messages);
  const setSubmission = useSetRecoilState<TSubmission | object | null>(submission.submission);
  const resetLatestMessage = useResetRecoilState(latestMessage);

  const _switchToConversation = (
    conversation: TConversation,
    messages: TMessagesAtom = null,
    preset: object | null = null,
    { endpointsConfig = {} },
  ) => {
    const { endpoint = null } = conversation;

    if (endpoint === null) {
      // get the default model
      conversation = getDefaultConversation({
        conversation,
        endpointsConfig,
        preset,
      });
    }

    setConversation(conversation);
    setMessages(messages);
    setSubmission({});
    resetLatestMessage();
  };

  const switchToConversation = useRecoilCallback(
    ({ snapshot }) =>
      async (
        _conversation: TConversation,
        messages: TMessagesAtom = null,
        preset: object | null = null,
      ) => {
        const endpointsConfig = await snapshot.getPromise(endpoints.endpointsConfig);
        _switchToConversation(_conversation, messages, preset, {
          endpointsConfig,
        });
      },
    [],
  );

  const newConversation = useCallback(
    (template = {}, preset: TPreset) => {
      switchToConversation(
        {
          conversationId: 'new',
          title: 'New Chat',
          ...template,
          endpoint: null,
          createdAt: '',
          updatedAt: '',
        },
        [],
        preset,
      );
    },
    [switchToConversation],
  );

  const searchPlaceholderConversation = () => {
    switchToConversation(
      {
        conversationId: 'search',
        title: 'Search',
        endpoint: null,
        createdAt: '',
        updatedAt: '',
      },
      [],
    );
  };

  return {
    _switchToConversation,
    newConversation,
    switchToConversation,
    searchPlaceholderConversation,
  };
};

export default {
  conversation,
  messages,
  messagesTree,
  latestMessage,
  messagesSiblingIdxFamily,
  useConversation,
};
