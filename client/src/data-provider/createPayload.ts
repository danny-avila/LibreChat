import type { TSubmission } from './types';

export default function createPayload(submission: TSubmission) {
  const { conversation, message, endpointOption } = submission;
  const { conversationId } = conversation;
  const { endpoint } = endpointOption;

  const endpointUrlMap = {
    azureOpenAI: '/api/ask/azureOpenAI',
    openAI: '/api/ask/openAI',
    google: '/api/ask/google',
    bingAI: '/api/ask/bingAI',
    chatGPTBrowser: '/api/ask/chatGPTBrowser',
    gptPlugins: '/api/ask/gptPlugins'
  };

  const server = endpointUrlMap[endpoint];

  const payload = {
    ...message,
    ...endpointOption,
    conversationId
  };

  return { server, payload };
}
