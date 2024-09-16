import {
  parseConvo,
  EModelEndpoint,
  isAssistantsEndpoint,
  isAgentsEndpoint,
} from 'librechat-data-provider';
import type { TConversation } from 'librechat-data-provider';
import getLocalStorageItems from './getLocalStorageItems';

const buildDefaultConvo = ({
  conversation,
  endpoint = null,
  models,
  lastConversationSetup,
}: {
  conversation: TConversation;
  endpoint: EModelEndpoint | null;
  models: string[];
  lastConversationSetup: TConversation | null;
}): TConversation => {
  const { lastSelectedModel, lastSelectedTools } = getLocalStorageItems();
  const endpointType = lastConversationSetup?.endpointType ?? conversation.endpointType;

  if (!endpoint) {
    return {
      ...conversation,
      endpointType,
      endpoint,
    };
  }

  const availableModels = models;
  const model = lastConversationSetup?.model ?? lastSelectedModel?.[endpoint] ?? '';
  const secondaryModel: string | null =
    endpoint === EModelEndpoint.gptPlugins
      ? lastConversationSetup?.agentOptions?.model ?? lastSelectedModel?.secondaryModel ?? null
      : null;

  let possibleModels: string[], secondaryModels: string[];

  if (availableModels.includes(model)) {
    possibleModels = [model, ...availableModels];
  } else {
    possibleModels = [...availableModels];
  }

  if (secondaryModel != null && secondaryModel !== '' && availableModels.includes(secondaryModel)) {
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
  const assistantId = convo?.assistant_id ?? '';
  const defaultAssistantId = lastConversationSetup?.assistant_id ?? '';
  if (isAssistantsEndpoint(endpoint) && !defaultAssistantId && assistantId) {
    defaultConvo.assistant_id = assistantId;
  }

  // Ensures agent_id is always defined
  const agentId = convo?.agent_id ?? '';
  const defaultAgentId = lastConversationSetup?.agent_id ?? '';
  if (isAgentsEndpoint(endpoint) && !defaultAgentId && agentId) {
    defaultConvo.agent_id = agentId;
  }

  defaultConvo.tools = lastConversationSetup?.tools ?? lastSelectedTools ?? defaultConvo.tools;

  return defaultConvo;
};

export default buildDefaultConvo;
