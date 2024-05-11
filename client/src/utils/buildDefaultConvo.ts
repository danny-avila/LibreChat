import { parseConvo, EModelEndpoint } from 'librechat-data-provider';
import type { TConversation } from 'librechat-data-provider';
import getLocalStorageItems from './getLocalStorageItems';

const buildDefaultConvo = ({
  conversation,
  endpoint,
  models,
  lastConversationSetup,
}: {
  conversation: TConversation;
  endpoint: EModelEndpoint;
  models: string[];
  // TODO: fix this type as we should allow undefined
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
    endpoint === EModelEndpoint.gptPlugins
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

  // Ensures assistant_id is always defined
  if (endpoint === EModelEndpoint.assistants && !defaultConvo.assistant_id && convo.assistant_id) {
    defaultConvo.assistant_id = convo.assistant_id;
  }

  defaultConvo.tools = lastConversationSetup?.tools ?? lastSelectedTools ?? defaultConvo.tools;
  defaultConvo.jailbreak = jailbreak ?? defaultConvo.jailbreak;
  defaultConvo.toneStyle = toneStyle ?? defaultConvo.toneStyle;

  return defaultConvo;
};

export default buildDefaultConvo;
