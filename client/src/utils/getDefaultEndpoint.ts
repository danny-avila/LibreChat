import type { TConversation, TPreset, TEndpointsConfig } from 'librechat-data-provider';
import { EModelEndpoint } from 'librechat-data-provider';
import getLocalStorageItems from './getLocalStorageItems';

type TConvoSetup = Partial<TPreset> | Partial<TConversation>;

type TDefaultEndpoint = { convoSetup: TConvoSetup; endpointsConfig: TEndpointsConfig };

export const defaultEndpoints: EModelEndpoint[] = [
  EModelEndpoint.openAI,
  EModelEndpoint.assistant,
  EModelEndpoint.azureOpenAI,
  EModelEndpoint.bingAI,
  EModelEndpoint.chatGPTBrowser,
  EModelEndpoint.gptPlugins,
  EModelEndpoint.google,
  EModelEndpoint.anthropic,
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
    const { endpoint } = lastConversationSetup;
    const isDefaultConfig = Object.values(endpointsConfig ?? {})?.every((value) => !value);

    if (isDefaultConfig && endpoint) {
      return endpoint;
    }

    if (isDefaultConfig && endpoint) {
      return endpoint;
    }

    return endpoint && endpointsConfig[endpoint] ? endpoint : null;
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
