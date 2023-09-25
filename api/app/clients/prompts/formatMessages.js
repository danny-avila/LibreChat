const { HumanMessage, AIMessage, SystemMessage } = require('langchain/schema');

/**
 * Formats a message based on the provided options.
 *
 * @param {Object} params - The parameters for formatting.
 * @param {Object} params.message - The message object to format.
 * @param {string} [params.message.role] - The role of the message sender (e.g., 'user', 'assistant').
 * @param {string} [params.message._name] - The name associated with the message.
 * @param {string} [params.message.sender] - The sender of the message.
 * @param {string} [params.message.text] - The text content of the message.
 * @param {string} [params.message.content] - The content of the message.
 * @param {string} [params.userName] - The name of the user.
 * @param {string} [params.assistantName] - The name of the assistant.
 * @param {boolean} [params.langChain=false] - Whether to return a LangChain message object.
 * @returns {(Object|HumanMessage|AIMessage|SystemMessage)} - The formatted message.
 */
const formatMessage = ({ message, userName, assistantName, langChain = false }) => {
  const { role: _role, _name, sender, text, content: _content } = message;
  const role = _role ?? (sender && sender?.toLowerCase() === 'user' ? 'user' : 'assistant');
  const content = text ?? _content ?? '';
  const formattedMessage = {
    role,
    content,
  };

  if (_name) {
    formattedMessage.name = _name;
  }

  if (userName && formattedMessage.role === 'user') {
    formattedMessage.name = userName;
  }

  if (assistantName && formattedMessage.role === 'assistant') {
    formattedMessage.name = assistantName;
  }

  if (!langChain) {
    return formattedMessage;
  }

  if (role === 'user') {
    return new HumanMessage(formattedMessage);
  } else if (role === 'assistant') {
    return new AIMessage(formattedMessage);
  } else {
    return new SystemMessage(formattedMessage);
  }
};

/**
 * Formats an array of messages for LangChain.
 *
 * @param {Array<Object>} messages - The array of messages to format.
 * @param {Object} formatOptions - The options for formatting each message.
 * @param {string} [formatOptions.userName] - The name of the user.
 * @param {string} [formatOptions.assistantName] - The name of the assistant.
 * @returns {Array<(HumanMessage|AIMessage|SystemMessage)>} - The array of formatted LangChain messages.
 */
const formatLangChainMessages = (messages, formatOptions) =>
  messages.map((msg) => formatMessage({ ...formatOptions, message: msg, langChain: true }));

module.exports = { formatMessage, formatLangChainMessages };
