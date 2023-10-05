const { HumanMessage, AIMessage, SystemMessage } = require('langchain/schema');

/**
 * Formats a message to OpenAI payload format based on the provided options.
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
  let { role: _role, _name, sender, text, content: _content, lc_id } = message;
  if (lc_id && lc_id[2] && !langChain) {
    const roleMapping = {
      SystemMessage: 'system',
      HumanMessage: 'user',
      AIMessage: 'assistant',
    };
    _role = roleMapping[lc_id[2]];
  }
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

/**
 * Formats a LangChain message object by merging properties from `lc_kwargs` or `kwargs` and `additional_kwargs`.
 *
 * @param {Object} message - The message object to format.
 * @param {Object} [message.lc_kwargs] - Contains properties to be merged. Either this or `message.kwargs` should be provided.
 * @param {Object} [message.kwargs] - Contains properties to be merged. Either this or `message.lc_kwargs` should be provided.
 * @param {Object} [message.kwargs.additional_kwargs] - Additional properties to be merged.
 *
 * @returns {Object} The formatted LangChain message.
 */
const formatFromLangChain = (message) => {
  const { additional_kwargs, ...message_kwargs } = message.lc_kwargs ?? message.kwargs;
  return {
    ...message_kwargs,
    ...additional_kwargs,
  };
};

module.exports = { formatMessage, formatLangChainMessages, formatFromLangChain };
