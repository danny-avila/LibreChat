import { useGetModelsQuery } from 'librechat-data-provider/react-query';
import type {
  TEndpointsConfig,
  TModelsConfig,
  TConversation,
  TPreset,
} from 'librechat-data-provider';
import { getDefaultEndpoint, buildDefaultConvo } from '~/utils';
import { useGetEndpointsQuery } from '~/data-provider';

type TDefaultConvo = { conversation: Partial<TConversation>; preset?: Partial<TPreset> | null };

const useDefaultConvo = () => {
  const { data: endpointsConfig = {} as TEndpointsConfig } = useGetEndpointsQuery();
  const { data: modelsConfig = {} as TModelsConfig } = useGetModelsQuery();

  const getDefaultConversation = ({ conversation, preset }: TDefaultConvo) => {
    const endpoint = getDefaultEndpoint({
      convoSetup: preset as TPreset,
      endpointsConfig,
    });

    const models = modelsConfig[endpoint] || [];

    return buildDefaultConvo({
      conversation: conversation as TConversation,
      endpoint,
      lastConversationSetup: preset as TConversation,
      models,
    });
  };

  return getDefaultConversation;
};

export default useDefaultConvo;
