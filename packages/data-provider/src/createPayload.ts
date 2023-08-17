import { tConversationSchema } from './schemas';
import { TSubmission, EModelEndpoint } from './types';

export default function createPayload(submission: TSubmission) {
  const { conversation, message, endpointOption, isEdited } = submission;
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

  let server = endpointUrlMap[endpoint];

  if (isEdited) {
    server = server.replace('/ask/', '/edit/');
  }

  const payload = {
    ...message,
    ...endpointOption,
    conversationId,
  };

  return { server, payload };
}
