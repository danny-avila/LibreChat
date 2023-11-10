import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRecoilState, useSetRecoilState, useResetRecoilState, useRecoilCallback } from 'recoil';
import { useGetEndpointsQuery } from 'librechat-data-provider';
import type { TConversation, TSubmission, TPreset, TModelsConfig } from 'librechat-data-provider';
import { buildDefaultConvo, getDefaultEndpoint } from '~/utils';
import store from '~/store';

const useNewConvo = (index = 0) => {
  const navigate = useNavigate();
  const [conversation, setConversation] = useRecoilState(store.conversationByIndex(index));
  const setSubmission = useSetRecoilState<TSubmission | null>(store.submissionByIndex(index));
  const resetLatestMessage = useResetRecoilState(
    store.latestMessageFamily(conversation?.conversationId ?? null),
  );
  const { data: endpointsConfig = {} } = useGetEndpointsQuery();

  const switchToConversation = useRecoilCallback(
    ({ snapshot }) =>
      async (
        conversation: TConversation,
        preset: TPreset | null = null,
        modelsData?: TModelsConfig,
      ) => {
        const modelsConfig = modelsData ?? snapshot.getLoadable(store.modelsConfig).contents;
        const { endpoint = null } = conversation;

        if (endpoint === null) {
          const defaultEndpoint = getDefaultEndpoint({
            convoSetup: preset ?? conversation,
            endpointsConfig,
          });

          const models = modelsConfig?.[defaultEndpoint] ?? [];
          conversation = buildDefaultConvo({
            conversation,
            lastConversationSetup: preset as TConversation,
            endpoint: defaultEndpoint,
            models,
          });
        }

        setConversation(conversation);
        setSubmission({} as TSubmission);
        resetLatestMessage();

        if (conversation.conversationId === 'new' && !modelsData) {
          navigate('/a/new');
        }
      },
    [endpointsConfig],
  );

  const newConversation = useCallback(
    ({
      template = {},
      preset,
      modelsData,
    }: {
      template?: Partial<TConversation>;
      preset?: TPreset;
      modelsData?: TModelsConfig;
    } = {}) => {
      switchToConversation(
        {
          conversationId: 'new',
          title: 'New Chat',
          ...template,
          endpoint: null,
          createdAt: '',
          updatedAt: '',
        },
        preset,
        modelsData,
      );
    },
    [switchToConversation],
  );

  return {
    switchToConversation,
    newConversation,
  };
};

export default useNewConvo;
