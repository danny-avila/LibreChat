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
    chatGPTBrowser: '/api/ask/chatGPTBrowser'
  };

  const server = endpointUrlMap[endpoint];

  let payload = {
    ...message,
    ...endpointOption,
    conversationId
  };

  return { server, payload };
}
