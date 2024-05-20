const { CohereConstants } = require('librechat-data-provider');
const { titleInstruction } = require('../prompts/titlePrompts');

// Mapping OpenAI roles to Cohere roles
const roleMap = {
  user: CohereConstants.ROLE_USER,
  assistant: CohereConstants.ROLE_CHATBOT,
  system: CohereConstants.ROLE_SYSTEM, // Recognize and map the system role explicitly
};

/**
 * Adjusts an OpenAI ChatCompletionPayload to conform with Cohere's expected chat payload format.
 * Now includes handling for "system" roles explicitly mentioned.
 *
 * @param {Object} options - Object containing the model options.
 * @param {ChatCompletionPayload} options.modelOptions - The OpenAI model payload options.
 * @returns {CohereChatStreamRequest} Cohere-compatible chat API payload.
 */
function createCoherePayload({ modelOptions }) {
  /** @type {string | undefined} */
  let preamble;
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
  let chatHistory = messages.reduce((acc, message, index, arr) => {
    const isLastUserMessage = index === arr.length - 1 && message.role === 'user';

    const messageContent =
      typeof message.content === 'string'
        ? message.content
        : message.content.map((part) => (part.type === 'text' ? part.text : '')).join(' ');

    if (isLastUserMessage) {
      latestUserMessageContent = messageContent;
    } else {
      acc.push({
        role: roleMap[message.role] || CohereConstants.ROLE_USER,
        message: messageContent,
      });
    }

    return acc;
  }, []);

  if (
    chatHistory.length === 1 &&
    chatHistory[0].role === CohereConstants.ROLE_SYSTEM &&
    !latestUserMessageContent.length
  ) {
    const message = chatHistory[0].message;
    latestUserMessageContent = message.includes(titleInstruction)
      ? CohereConstants.TITLE_MESSAGE
      : '.';
    preamble = message;
  }

  return {
    message: latestUserMessageContent,
    model: model,
    chatHistory,
    stream: stream ?? false,
    temperature: temperature,
    frequencyPenalty: frequency_penalty,
    presencePenalty: presence_penalty,
    maxTokens: max_tokens,
    stopSequences: stop,
    preamble,
    p: top_p,
    ...rest,
  };
}

module.exports = createCoherePayload;
