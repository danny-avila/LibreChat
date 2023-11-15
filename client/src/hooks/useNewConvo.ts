import { useCallback } from 'react';
import { useSetRecoilState, useResetRecoilState, useRecoilCallback } from 'recoil';
import { useGetEndpointsQuery } from 'librechat-data-provider';
import type { TConversation, TSubmission, TPreset, TModelsConfig } from 'librechat-data-provider';
import { buildDefaultConvo, getDefaultEndpoint } from '~/utils';
import useOriginNavigate from './useOriginNavigate';
import useSetStorage from './useSetStorage';
import store from '~/store';

const useNewConvo = (index = 0) => {
  const setStorage = useSetStorage();
  const navigate = useOriginNavigate();
  // const setConversation = useSetRecoilState(store.conversationByIndex(index));
  const { setConversation } = store.useCreateConversationAtom(index);
  const setSubmission = useSetRecoilState<TSubmission | null>(store.submissionByIndex(index));
  const resetLatestMessage = useResetRecoilState(store.latestMessageFamily(index));
  const { data: endpointsConfig = {} } = useGetEndpointsQuery();

  const switchToConversation = useRecoilCallback(
    ({ snapshot }) =>
      async (
        conversation: TConversation,
        preset: TPreset | null = null,
        modelsData?: TModelsConfig,
        buildDefault?: boolean,
      ) => {
        const modelsConfig = modelsData ?? snapshot.getLoadable(store.modelsConfig).contents;
        const { endpoint = null } = conversation;

        if (endpoint === null || buildDefault) {
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

        setStorage(conversation);
        setConversation(conversation);
        setSubmission({} as TSubmission);
        resetLatestMessage();

        if (conversation.conversationId === 'new' && !modelsData) {
          navigate('new');
        }
      },
    [endpointsConfig],
  );

  const newConversation = useCallback(
    ({
      template = {},
      preset,
      modelsData,
      buildDefault = true,
    }: {
      template?: Partial<TConversation>;
      preset?: TPreset;
      modelsData?: TModelsConfig;
      buildDefault?: boolean;
    } = {}) => {
      switchToConversation(
        {
          conversationId: 'new',
          title: 'New Chat',
          endpoint: null,
          ...template,
          createdAt: '',
          updatedAt: '',
        },
        preset,
        modelsData,
        buildDefault,
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
