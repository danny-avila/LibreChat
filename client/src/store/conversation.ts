import { useCallback } from 'react';
import {
  atom,
  selector,
  atomFamily,
  useSetRecoilState,
  useResetRecoilState,
  useRecoilCallback,
} from 'recoil';
import {
  TConversation,
  TMessagesAtom,
  TMessage,
  TSubmission,
  TPreset,
} from 'librechat-data-provider';
import { buildTree, getDefaultConversation } from '~/utils';
import submission from './submission';
import endpoints from './endpoints';

const conversation = atom<TConversation | null>({
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

const latestMessage = atom<TMessage | null>({
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
  const setSubmission = useSetRecoilState<TSubmission | null>(submission.submission);
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
    setSubmission({} as TSubmission);
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
    (template = {}, preset?: TPreset) => {
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
  messages,
  conversation,
  messagesTree,
  latestMessage,
  messagesSiblingIdxFamily,
  useConversation,
};
