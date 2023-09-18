import type { TConversation, TPreset, TEndpointsConfig } from 'librechat-data-provider';
import getLocalStorageItems from './getLocalStorageItems';

type TConvoSetup = Partial<TPreset> | Partial<TConversation>;

type TDefaultEndpoint = { convoSetup: TConvoSetup; endpointsConfig: TEndpointsConfig };

const defaultEndpoints = [
  'openAI',
  'azureOpenAI',
  'bingAI',
  'chatGPTBrowser',
  'gptPlugins',
  'google',
  'anthropic',
];

const getEndpointFromSetup = (convoSetup: TConvoSetup, endpointsConfig: TEndpointsConfig) => {
  const { endpoint: targetEndpoint } = convoSetup || {};
  if (targetEndpoint && endpointsConfig?.[targetEndpoint]) {
    return targetEndpoint;
  } else if (targetEndpoint) {
    console.warn(`Illegal target endpoint ${targetEndpoint} ${endpointsConfig}`);
  }
  return null;
};

const getEndpointFromLocalStorage = (endpointsConfig: TEndpointsConfig) => {
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

const getDefinedEndpoint = (endpointsConfig: TEndpointsConfig) => {
  return defaultEndpoints.find((e) => Object.hasOwn(endpointsConfig ?? {}, e)) ?? 'openAI';
};

const getDefaultEndpoint = ({ convoSetup, endpointsConfig }: TDefaultEndpoint) => {
  return (
    getEndpointFromSetup(convoSetup, endpointsConfig) ||
    getEndpointFromLocalStorage(endpointsConfig) ||
    getDefinedEndpoint(endpointsConfig)
  );
};

export default getDefaultEndpoint;
