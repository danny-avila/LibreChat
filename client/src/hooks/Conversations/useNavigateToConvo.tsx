import { useQueryClient } from '@tanstack/react-query';
import { useSetRecoilState, useResetRecoilState } from 'recoil';
import { QueryKeys, EModelEndpoint, LocalStorageKeys } from 'librechat-data-provider';
import type { TConversation, TEndpointsConfig, TModelsConfig } from 'librechat-data-provider';
import { buildDefaultConvo, getDefaultEndpoint, getEndpointField } from '~/utils';
import useOriginNavigate from '../useOriginNavigate';
import store from '~/store';

const useNavigateToConvo = (index = 0) => {
  const queryClient = useQueryClient();
  const navigate = useOriginNavigate();
  const { setConversation } = store.useCreateConversationAtom(index);
  const setSubmission = useSetRecoilState(store.submissionByIndex(index));
  const resetLatestMessage = useResetRecoilState(store.latestMessageFamily(index));

  const navigateToConvo = (conversation: TConversation, _resetLatestMessage = true) => {
    if (!conversation) {
      console.log('Conversation not provided');
      return;
    }
    setSubmission(null);
    if (_resetLatestMessage) {
      resetLatestMessage();
    }

    let convo = { ...conversation };
    if (!convo?.endpoint) {
      /* undefined endpoint edge case */
      const modelsConfig = queryClient.getQueryData<TModelsConfig>([QueryKeys.models]);
      const endpointsConfig = queryClient.getQueryData<TEndpointsConfig>([QueryKeys.endpoints]);
      const defaultEndpoint = getDefaultEndpoint({
        convoSetup: conversation,
        endpointsConfig,
      });

      const endpointType = getEndpointField(endpointsConfig, defaultEndpoint, 'type');
      if (!conversation.endpointType && endpointType) {
        conversation.endpointType = endpointType;
      }

      const models = modelsConfig?.[defaultEndpoint ?? ''] ?? [];

      convo = buildDefaultConvo({
        conversation,
        endpoint: defaultEndpoint,
        lastConversationSetup: conversation,
        models,
      });
    }
    setConversation(convo);
    navigate(convo?.conversationId);
  };

  const navigateWithLastTools = (conversation: TConversation) => {
    // set conversation to the new conversation
    if (conversation?.endpoint === EModelEndpoint.gptPlugins) {
      let lastSelectedTools = [];
      try {
        lastSelectedTools =
          JSON.parse(localStorage.getItem(LocalStorageKeys.LAST_TOOLS) ?? '') ?? [];
      } catch (e) {
        // console.error(e);
      }
      navigateToConvo({
        ...conversation,
        tools: conversation?.tools?.length ? conversation?.tools : lastSelectedTools,
      });
    } else {
      navigateToConvo(conversation);
    }
  };

  return {
    navigateToConvo,
    navigateWithLastTools,
  };
};

export default useNavigateToConvo;
