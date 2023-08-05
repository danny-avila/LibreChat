import { tConversationSchema } from './schemas';
import type { TSubmission, EModelEndpoint } from './types';

export default function createPayload(submission: TSubmission) {
  const { conversation, message, endpointOption } = submission;
  const { conversationId } = tConversationSchema.parse(conversation);
  const { endpoint } = endpointOption as { endpoint: EModelEndpoint };

  const endpointUrlMap = {
    azureOpenAI: '/api/ask/azureOpenAI',
    openAI: '/api/ask/openAI',
    google: '/api/ask/google',
    bingAI: '/api/ask/bingAI',
    chatGPT: '/api/ask/chatGPT',
    chatGPTBrowser: '/api/ask/chatGPTBrowser',
    gptPlugins: '/api/ask/gptPlugins',
    anthropic: '/api/ask/anthropic',
  };

  const server = endpointUrlMap[endpoint];

  const payload = {
    ...message,
    ...endpointOption,
    conversationId,
  };

  return { server, payload };
}
