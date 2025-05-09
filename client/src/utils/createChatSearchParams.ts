import { isAgentsEndpoint, isAssistantsEndpoint, Constants } from 'librechat-data-provider';
import type { TConversation, TPreset } from 'librechat-data-provider';

export default function createChatSearchParams(
  input: TConversation | TPreset | Record<string, string> | null,
): URLSearchParams {
  if (input == null) {
    return new URLSearchParams();
  }

  const params = new URLSearchParams();

  const allowedParams = [
    'endpoint',
    'model',
    'temperature',
    'presence_penalty',
    'frequency_penalty',
    'stop',
    'top_p',
    'max_tokens',
    'topP',
    'topK',
    'maxOutputTokens',
    'promptCache',
    'region',
    'maxTokens',
    'agent_id',
    'assistant_id',
  ];

  if (input && typeof input === 'object' && !('endpoint' in input) && !('model' in input)) {
    Object.entries(input as Record<string, string>).forEach(([key, value]) => {
      if (value != null && allowedParams.includes(key)) {
        params.set(key, value);
      }
    });
    return params;
  }

  const conversation = input as TConversation | TPreset;
  const endpoint = conversation.endpoint;
  if (conversation.spec) {
    return new URLSearchParams({ spec: conversation.spec });
  }
  if (
    isAgentsEndpoint(endpoint) &&
    conversation.agent_id &&
    conversation.agent_id !== Constants.EPHEMERAL_AGENT_ID
  ) {
    return new URLSearchParams({ agent_id: String(conversation.agent_id) });
  } else if (isAssistantsEndpoint(endpoint) && conversation.assistant_id) {
    return new URLSearchParams({ assistant_id: String(conversation.assistant_id) });
  } else if (isAgentsEndpoint(endpoint) && !conversation.agent_id) {
    return params;
  } else if (isAssistantsEndpoint(endpoint) && !conversation.assistant_id) {
    return params;
  }

  if (endpoint) {
    params.set('endpoint', endpoint);
  }
  if (conversation.model) {
    params.set('model', conversation.model);
  }

  const paramMap = {
    temperature: conversation.temperature,
    presence_penalty: conversation.presence_penalty,
    frequency_penalty: conversation.frequency_penalty,
    stop: conversation.stop,
    top_p: conversation.top_p,
    max_tokens: conversation.max_tokens,
    topP: conversation.topP,
    topK: conversation.topK,
    maxOutputTokens: conversation.maxOutputTokens,
    promptCache: conversation.promptCache,
    region: conversation.region,
    maxTokens: conversation.maxTokens,
  };

  return Object.entries(paramMap).reduce((params, [key, value]) => {
    if (value != null) {
      if (Array.isArray(value)) {
        params.set(key, key === 'stop' ? value.join(',') : JSON.stringify(value));
      } else {
        params.set(key, String(value));
      }
    }

    return params;
  }, params);
}
