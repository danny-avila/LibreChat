import type { TConversation, TPreset } from 'librechat-data-provider';

export default function createChatSearchParams(
  input: TConversation | TPreset | Record<string, string> | null,
): URLSearchParams {
  if (input == null) {
    return new URLSearchParams();
  }

  const params = new URLSearchParams();

  // Define the allowable parameters
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

  // Handle Record<string, string> directly
  if (input && typeof input === 'object' && !('endpoint' in input) && !('model' in input)) {
    Object.entries(input as Record<string, string>).forEach(([key, value]) => {
      if (value != null && allowedParams.includes(key)) {
        params.set(key, value);
      }
    });
    return params;
  }

  const conversation = input as TConversation | TPreset;

  // If agent_id or assistant_id are present, they take precedence over all other params
  if (conversation.agent_id) {
    return new URLSearchParams({ agent_id: String(conversation.agent_id) });
  } else if (conversation.assistant_id) {
    return new URLSearchParams({ assistant_id: String(conversation.assistant_id) });
  }

  // Otherwise, set regular params
  if (conversation.endpoint) {
    params.set('endpoint', conversation.endpoint);
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
