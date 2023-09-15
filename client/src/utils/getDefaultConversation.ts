/*

This file is no longer used but kept for reference. Its logic was separated into 3 pieces:

1. The default endpoint retriever logic is now found in ./getDefaultEndpoint.ts
2. The default conversation builder is now found in ./buildDefaultConvo.ts
3. The main function logic, which was mainly used to fill in default values for a preset
    or new conversation, is now used as a hook in ~/hooks/useDefaultConvo.ts

import { parseConvo } from 'librechat-data-provider';
import getLocalStorageItems from './getLocalStorageItems';
import type { TConversation, EModelEndpoint, TModelsConfig } from 'librechat-data-provider';

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
  modelsConfig,
  lastConversationSetup,
}: {
  conversation: TConversation;
  endpoint: EModelEndpoint;
  modelsConfig: TModelsConfig;
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

  const availableModels = modelsConfig[endpoint];
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

const getDefaultConversation = ({ conversation, endpointsConfig, modelsConfig, preset }) => {
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
    modelsConfig,
  });
};

export default getDefaultConversation;
*/
