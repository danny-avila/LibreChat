import {
  parseConvo,
  EModelEndpoint,
  isAssistantsEndpoint,
  isAgentsEndpoint,
} from 'librechat-data-provider';
import type { TConversation, EndpointSchemaKey } from 'librechat-data-provider';
import { getLocalStorageItems } from './localStorage';

/**
 * Upgrades Claude models to the latest Sonnet 4.5 for Anthropic endpoint
 */
function upgradeClaudeModel(model: string | undefined, endpoint: EModelEndpoint | null): string | undefined {
  if (!model || endpoint !== EModelEndpoint.anthropic) {
    return model;
  }
  
  // Upgrade old Claude 3.5 models
  if (
    model === 'claude-3-5-sonnet-latest' ||
    model === 'claude-3-5-sonnet-20241022' ||
    model === 'claude-3-5-sonnet-20240620' ||
    model.startsWith('claude-3-5-sonnet')
  ) {
    return 'claude-sonnet-4-5-20250929';
  }
  
  // Upgrade Haiku models to Sonnet
  if (
    model === 'claude-haiku-4-5' ||
    model === 'claude-haiku-4-5-20251001' ||
    model.startsWith('claude-haiku-4-5') ||
    model.startsWith('claude-3-5-haiku') ||
    model.startsWith('claude-haiku-3')
  ) {
    return 'claude-sonnet-4-5-20250929';
  }
  
  return model;
}

const buildDefaultConvo = ({
  models,
  conversation,
  endpoint = null,
  lastConversationSetup,
}: {
  models: string[];
  conversation: TConversation;
  endpoint?: EModelEndpoint | null;
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
  let model = lastConversationSetup?.model ?? lastSelectedModel?.[endpoint] ?? '';
  
  // Upgrade Claude models to Sonnet 4.5
  model = upgradeClaudeModel(model, endpoint) ?? '';
  
  const secondaryModel: string | null =
    endpoint === EModelEndpoint.gptPlugins
      ? (lastConversationSetup?.agentOptions?.model ?? lastSelectedModel?.secondaryModel ?? null)
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
    endpoint: endpoint as EndpointSchemaKey,
    endpointType: endpointType as EndpointSchemaKey,
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

  // Upgrade Claude model in the final conversation object
  if (endpoint === EModelEndpoint.anthropic) {
    if (defaultConvo.model) {
      defaultConvo.model = upgradeClaudeModel(defaultConvo.model, endpoint) ?? defaultConvo.model;
    } else {
      // If no model is set, use the default Claude Sonnet 4.5
      defaultConvo.model = 'claude-sonnet-4-5-20250929';
    }
  }

  // Ensures assistant_id is always defined
  const assistantId = convo?.assistant_id ?? conversation?.assistant_id ?? '';
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
