import { useCallback } from 'react';
import { useSetRecoilState, useResetRecoilState, useRecoilCallback } from 'recoil';
import { useGetEndpointsQuery, useGetModelsQuery } from 'librechat-data-provider/react-query';
import type {
  TConversation,
  TMessagesAtom,
  TSubmission,
  TPreset,
  TModelsConfig,
  TEndpointsConfig,
} from 'librechat-data-provider';
import { buildDefaultConvo, getDefaultEndpoint, getEndpointField } from '~/utils';
import useOriginNavigate from '../useOriginNavigate';
import store from '~/store';

const useConversation = () => {
  const navigate = useOriginNavigate();
  const setConversation = useSetRecoilState(store.conversation);
  const resetLatestMessage = useResetRecoilState(store.latestMessage);
  const setMessages = useSetRecoilState<TMessagesAtom>(store.messages);
  const setSubmission = useSetRecoilState<TSubmission | null>(store.submission);
  const { data: endpointsConfig = {} as TEndpointsConfig } = useGetEndpointsQuery();
  const modelsQuery = useGetModelsQuery();

  const switchToConversation = useRecoilCallback(
    () =>
      async (
        conversation: TConversation,
        messages: TMessagesAtom = null,
        preset: TPreset | null = null,
        modelsData?: TModelsConfig,
      ) => {
        const modelsConfig = modelsData ?? modelsQuery.data;
        const { endpoint = null } = conversation;

        if (endpoint === null) {
          const defaultEndpoint = getDefaultEndpoint({
            convoSetup: preset ?? conversation,
            endpointsConfig,
          });

          const endpointType = getEndpointField(endpointsConfig, defaultEndpoint, 'type');
          if (!conversation.endpointType && endpointType) {
            conversation.endpointType = endpointType;
          }

          const models = modelsConfig?.[defaultEndpoint] ?? [];
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
    [endpointsConfig, modelsQuery.data],
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
