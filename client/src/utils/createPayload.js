export default function createPayload(submission) {
  const { conversation, message, endpointOption } = submission;
  const { conversationId } = conversation;
  const { endpoint } = endpointOption;

  const endpointUrlMap = {
    azureOpenAI: '/api/ask/azureOpenAI',
    openAI: '/api/ask/openAI',
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
