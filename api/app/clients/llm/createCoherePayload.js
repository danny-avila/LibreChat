// Mapping OpenAI roles to Cohere roles
const roleMap = {
  user: 'USER',
  assistant: 'CHATBOT',
  system: 'SYSTEM', // Recognize and map the system role explicitly
};

/**
 * Adjusts an OpenAI ChatCompletionPayload to conform with Cohere's expected chat payload format.
 * Now includes handling for "system" roles explicitly mentioned.
 *
 * @param {Object} options - Object containing the model options.
 * @param {ChatCompletionPayload} options.modelOptions - The OpenAI model payload options.
 * @returns {CohereChatPayload} Cohere-compatible chat API payload.
 */
function createCoherePayload({ modelOptions }) {
  let latestUserMessageContent = '';
  const {
    stream,
    stop,
    top_p,
    temperature,
    frequency_penalty,
    presence_penalty,
    max_tokens,
    messages,
    model,
    ...rest
  } = modelOptions;

  // Filter out the latest user message and transform remaining messages to Cohere's chat_history format
  const chatHistory = messages.reduce((acc, message, index, arr) => {
    const isLastUserMessage = index === arr.length - 1 && message.role === 'user';

    const messageContent =
      typeof message.content === 'string'
        ? message.content
        : message.content.map((part) => (part.type === 'text' ? part.text : '')).join(' ');

    if (isLastUserMessage) {
      latestUserMessageContent = messageContent;
    } else {
      acc.push({
        role: roleMap[message.role] || 'USER',
        message: messageContent,
      });
    }

    return acc;
  }, []);

  return {
    message: latestUserMessageContent,
    model: model,
    chat_history: chatHistory,
    stream: stream ?? false,
    temperature: temperature,
    frequency_penalty: frequency_penalty,
    presence_penalty: presence_penalty,
    max_tokens: max_tokens,
    stop_sequences: stop,
    p: top_p,
    ...rest,
  };
}

module.exports = createCoherePayload;
