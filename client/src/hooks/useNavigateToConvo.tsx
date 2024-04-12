import { useQueryClient } from '@tanstack/react-query';
import { useSetRecoilState, useResetRecoilState, useRecoilValue } from 'recoil';
import { QueryKeys } from 'librechat-data-provider';
import type { TConversation, TEndpointsConfig, TModelsConfig } from 'librechat-data-provider';
import { buildDefaultConvo, getDefaultEndpoint, getEndpointField } from '~/utils';
// import useOriginNavigate from './useOriginNavigate';
import useSetStorage from './useSetStorage';
import store from '~/store';
import { useNavigate } from 'react-router-dom';

const useNavigateToConvo = (index = 0) => {
  const convoType = useRecoilValue(store.convoType);
  const setStorage = useSetStorage();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { setConversation } = store.useCreateConversationAtom(index);
  const setSubmission = useSetRecoilState(store.submissionByIndex(index));
  // const setConversation = useSetRecoilState(store.conversationByIndex(index));
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
    setStorage(convo);
    setConversation(convo);
    navigate(`/${convoType}/${convo?.conversationId}`);
  };

  return {
    navigateToConvo,
  };
};

export default useNavigateToConvo;
