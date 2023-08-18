import { parseConvo } from 'librechat-data-provider';
import getLocalStorageItems from './getLocalStorageItems';
import type {
  TConversation,
  TEndpointsConfig,
  EModelEndpoint,
  TConfig,
} from 'librechat-data-provider';

const defaultEndpoints = [
  'openAI',
  'azureOpenAI',
  'bingAI',
  'chatGPTBrowser',
  'gptPlugins',
  'google',
  'anthropic',
];

const buildDefaultConversation = ({
  conversation,
  endpoint,
  endpointsConfig,
  lastConversationSetup,
}: {
  conversation: TConversation;
  endpoint: EModelEndpoint;
  endpointsConfig: TEndpointsConfig;
  lastConversationSetup: TConversation;
}) => {
  const { lastSelectedModel, lastSelectedTools, lastBingSettings } = getLocalStorageItems();
  const { jailbreak, toneStyle } = lastBingSettings;

  if (!endpoint) {
    return {
      ...conversation,
      endpoint,
    };
  }

  const { availableModels = [] } = endpointsConfig[endpoint] as TConfig;
  const possibleModels = [lastSelectedModel[endpoint], ...availableModels];
  const convo = parseConvo(endpoint, lastConversationSetup, { model: possibleModels });
  const defaultConvo = {
    ...conversation,
    ...convo,
    endpoint,
  };

  defaultConvo.tools = lastSelectedTools ?? defaultConvo.tools;
  defaultConvo.jailbreak = jailbreak ?? defaultConvo.jailbreak;
  defaultConvo.toneStyle = toneStyle ?? defaultConvo.toneStyle;

  return defaultConvo;
};

const getDefaultConversation = ({ conversation, endpointsConfig, preset }) => {
  const getEndpointFromPreset = () => {
    const { endpoint: targetEndpoint } = preset || {};
    if (targetEndpoint && endpointsConfig?.[targetEndpoint]) {
      return targetEndpoint;
    } else if (targetEndpoint) {
      console.warn(`Illegal target endpoint ${targetEndpoint} ${endpointsConfig}`);
    }
    return null;
  };

  const getEndpointFromLocalStorage = () => {
    try {
      const { lastConversationSetup } = getLocalStorageItems();

      return (
        lastConversationSetup.endpoint &&
        (endpointsConfig[lastConversationSetup.endpoint] ? lastConversationSetup.endpoint : null)
      );
    } catch (error) {
      console.error(error);
      return null;
    }
  };

  const getDefaultEndpoint = () => {
    return defaultEndpoints.find((e) => endpointsConfig?.[e]) || null;
  };

  const endpoint = getEndpointFromPreset() || getEndpointFromLocalStorage() || getDefaultEndpoint();

  return buildDefaultConversation({
    conversation,
    endpoint,
    lastConversationSetup: preset,
    endpointsConfig,
  });
};

export default getDefaultConversation;
