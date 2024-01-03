import { parseConvo } from 'librechat-data-provider';
import getLocalStorageItems from './getLocalStorageItems';
import type { TConversation, EModelEndpoint } from 'librechat-data-provider';

const buildDefaultConvo = ({
  conversation,
  endpoint,
  models,
  lastConversationSetup,
}: {
  conversation: TConversation;
  endpoint: EModelEndpoint;
  models: string[];
  lastConversationSetup: TConversation;
}) => {
  const { lastSelectedModel, lastSelectedTools, lastBingSettings } = getLocalStorageItems();
  const { jailbreak, toneStyle } = lastBingSettings;
  const endpointType = lastConversationSetup?.endpointType ?? conversation?.endpointType;

  if (!endpoint) {
    return {
      ...conversation,
      endpointType,
      endpoint,
    };
  }

  const availableModels = models;
  const model = lastConversationSetup?.model ?? lastSelectedModel?.[endpoint];
  const secondaryModel =
    endpoint === 'gptPlugins'
      ? lastConversationSetup?.agentOptions?.model ?? lastSelectedModel?.secondaryModel
      : null;

  let possibleModels: string[], secondaryModels: string[];

  if (availableModels.includes(model)) {
    possibleModels = [model, ...availableModels];
  } else {
    possibleModels = [...availableModels];
  }

  if (secondaryModel && availableModels.includes(secondaryModel)) {
    secondaryModels = [secondaryModel, ...availableModels];
  } else {
    secondaryModels = [...availableModels];
  }

  const convo = parseConvo({
    endpoint,
    endpointType,
    conversation: lastConversationSetup,
    possibleValues: {
      models: possibleModels,
      secondaryModels,
    },
  });

  const defaultConvo = {
    ...conversation,
    ...convo,
    endpointType,
    endpoint,
  };

  defaultConvo.tools = lastSelectedTools ?? defaultConvo.tools;
  defaultConvo.jailbreak = jailbreak ?? defaultConvo.jailbreak;
  defaultConvo.toneStyle = toneStyle ?? defaultConvo.toneStyle;

  return defaultConvo;
};

export default buildDefaultConvo;
