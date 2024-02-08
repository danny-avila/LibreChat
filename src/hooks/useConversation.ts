import { useCallback } from 'react';
import { useSetRecoilState, useResetRecoilState, useRecoilCallback } from 'recoil';
import type {
  TConversation,
  TMessagesAtom,
  TSubmission,
  TPreset,
  TModelsConfig,
  TEndpointsConfig,
} from 'librechat-data-provider';
import { buildDefaultConvo, getDefaultEndpoint, getEndpointField } from '~/utils';
import useOriginNavigate from './useOriginNavigate';
import store from '~/store';

const useConversation = () => {
  const navigate = useOriginNavigate();
  const setConversation = useSetRecoilState(store.conversation);
  const setMessages = useSetRecoilState<TMessagesAtom>(store.messages);
  const setSubmission = useSetRecoilState<TSubmission | null>(store.submission);
  const resetLatestMessage = useResetRecoilState(store.latestMessage);

  const switchToConversation = useRecoilCallback(
    ({ snapshot }) =>
      async (
        conversation: TConversation,
        messages: TMessagesAtom = null,
        preset: TPreset | null = null,
        modelsData?: TModelsConfig,
      ) => {
        const modelsConfig = modelsData ?? snapshot.getLoadable(store.modelsConfig).contents;
        const { endpoint = null } = conversation;

        if (endpoint === null) {
          const defaultEndpoint = null;

          if (!conversation.endpointType) {
            conversation.endpointType = undefined;
          }

          const models = [];
          conversation = buildDefaultConvo({
            conversation,
            lastConversationSetup: preset as TConversation,
            endpoint: defaultEndpoint,
            models,
          });
        }

        setConversation(conversation);
        setMessages(messages);
        setSubmission({} as TSubmission);
        resetLatestMessage();

        if (conversation.conversationId === 'new' && !modelsData) {
          navigate('new');
        }
      },
    [],
  );

  const newConversation = useCallback(
    (template = {}, preset?: TPreset, modelsData?: TModelsConfig) => {
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
        modelsData,
      );
    },
    [switchToConversation],
  );

  const searchPlaceholderConversation = useCallback(() => {
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
  }, [switchToConversation]);

  return {
    switchToConversation,
    newConversation,
    searchPlaceholderConversation,
  };
};

export default useConversation;
