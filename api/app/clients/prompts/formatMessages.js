const { ToolMessage } = require('@langchain/core/messages');
const { EModelEndpoint, ContentTypes } = require('librechat-data-provider');
const { HumanMessage, AIMessage, SystemMessage } = require('@langchain/core/messages');

/**
 * Formats a message to OpenAI Vision API payload format.
 *
 * @param {Object} params - The parameters for formatting.
 * @param {Object} params.message - The message object to format.
 * @param {string} [params.message.role] - The role of the message sender (must be 'user').
 * @param {string} [params.message.content] - The text content of the message.
 * @param {EModelEndpoint} [params.endpoint] - Identifier for specific endpoint handling
 * @param {Array<string>} [params.image_urls] - The image_urls to attach to the message.
 * @returns {(Object)} - The formatted message.
 */
const formatVisionMessage = ({ message, image_urls, endpoint }) => {
  if (endpoint === EModelEndpoint.anthropic) {
    message.content = [...image_urls, { type: ContentTypes.TEXT, text: message.content }];
    return message;
  }

  message.content = [{ type: ContentTypes.TEXT, text: message.content }, ...image_urls];

  return message;
};

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
 * @param {Array<string>} [params.message.image_urls] - The image_urls attached to the message for Vision API.
 * @param {string} [params.userName] - The name of the user.
 * @param {string} [params.assistantName] - The name of the assistant.
 * @param {string} [params.endpoint] - Identifier for specific endpoint handling
 * @param {boolean} [params.langChain=false] - Whether to return a LangChain message object.
 * @returns {(Object|HumanMessage|AIMessage|SystemMessage)} - The formatted message.
 */
const formatMessage = ({ message, userName, assistantName, endpoint, langChain = false }) => {
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
  const content = _content ?? text ?? '';
  const formattedMessage = {
    role,
    content,
  };

  const { image_urls } = message;
  if (Array.isArray(image_urls) && image_urls.length > 0 && role === 'user') {
    return formatVisionMessage({
      message: formattedMessage,
      image_urls: message.image_urls,
      endpoint,
    });
  }

  if (_name) {
    formattedMessage.name = _name;
  }

  if (userName && formattedMessage.role === 'user') {
    formattedMessage.name = userName;
  }

  if (assistantName && formattedMessage.role === 'assistant') {
    formattedMessage.name = assistantName;
  }

  if (formattedMessage.name) {
    // Conform to API regex: ^[a-zA-Z0-9_-]{1,64}$
    // https://community.openai.com/t/the-format-of-the-name-field-in-the-documentation-is-incorrect/175684/2
    formattedMessage.name = formattedMessage.name.replace(/[^a-zA-Z0-9_-]/g, '_');

    if (formattedMessage.name.length > 64) {
      formattedMessage.name = formattedMessage.name.substring(0, 64);
    }
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

/**
 * Formats an array of messages for LangChain, handling tool calls and creating ToolMessage instances.
 *
 * @param {Array<Partial<TMessage>>} payload - The array of messages to format.
 * @returns {Array<(HumanMessage|AIMessage|SystemMessage|ToolMessage)>} - The array of formatted LangChain messages, including ToolMessages for tool calls.
 */
const formatAgentMessages = (payload) => {
  const messages = [];

  for (const message of payload) {
    if (typeof message.content === 'string') {
      message.content = [{ type: ContentTypes.TEXT, [ContentTypes.TEXT]: message.content }];
    }
    if (message.role !== 'assistant') {
      messages.push(formatMessage({ message, langChain: true }));
      continue;
    }

    let currentContent = [];
    let lastAIMessage = null;

    let hasReasoning = false;
    for (const part of message.content) {
      if (part.type === ContentTypes.TEXT && part.tool_call_ids) {
        /*
        If there's pending content, it needs to be aggregated as a single string to prepare for tool calls.
        For Anthropic models, the "tool_calls" field on a message is only respected if content is a string.
         */
        if (currentContent.length > 0) {
          let content = currentContent.reduce((acc, curr) => {
            if (curr.type === ContentTypes.TEXT) {
              return `${acc}${curr[ContentTypes.TEXT]}\n`;
            }
            return acc;
          }, '');
          content = `${content}\n${part[ContentTypes.TEXT] ?? ''}`.trim();
          lastAIMessage = new AIMessage({ content });
          messages.push(lastAIMessage);
          currentContent = [];
          continue;
        }

        // Create a new AIMessage with this text and prepare for tool calls
        lastAIMessage = new AIMessage({
          content: part.text || '',
        });

        messages.push(lastAIMessage);
      } else if (part.type === ContentTypes.TOOL_CALL) {
        if (!lastAIMessage) {
          throw new Error('Invalid tool call structure: No preceding AIMessage with tool_call_ids');
        }

        // Note: `tool_calls` list is defined when constructed by `AIMessage` class, and outputs should be excluded from it
        const { output, args: _args, ...tool_call } = part.tool_call;
        // TODO: investigate; args as dictionary may need to be provider-or-tool-specific
        let args = _args;
        try {
          args = JSON.parse(_args);
        } catch (e) {
          if (typeof _args === 'string') {
            args = { input: _args };
          }
        }

        tool_call.args = args;
        lastAIMessage.tool_calls.push(tool_call);

        // Add the corresponding ToolMessage
        messages.push(
          new ToolMessage({
            tool_call_id: tool_call.id,
            name: tool_call.name,
            content: output || '',
          }),
        );
      } else if (part.type === ContentTypes.THINK) {
        hasReasoning = true;
        continue;
      } else {
        currentContent.push(part);
      }
    }

    if (hasReasoning) {
      currentContent = currentContent
        .reduce((acc, curr) => {
          if (curr.type === ContentTypes.TEXT) {
            return `${acc}${curr[ContentTypes.TEXT]}\n`;
          }
          return acc;
        }, '')
        .trim();
    }

    if (currentContent.length > 0) {
      messages.push(new AIMessage({ content: currentContent }));
    }
  }

  return messages;
};

/**
 * Formats an array of messages for LangChain, making sure all content fields are strings
 * @param {Array<(HumanMessage|AIMessage|SystemMessage|ToolMessage)>} payload - The array of messages to format.
 * @returns {Array<(HumanMessage|AIMessage|SystemMessage|ToolMessage)>} - The array of formatted LangChain messages, including ToolMessages for tool calls.
 */
const formatContentStrings = (payload) => {
  const messages = [];

  for (const message of payload) {
    if (typeof message.content === 'string') {
      continue;
    }

    if (!Array.isArray(message.content)) {
      continue;
    }

    // Reduce text types to a single string, ignore all other types
    const content = message.content.reduce((acc, curr) => {
      if (curr.type === ContentTypes.TEXT) {
        return `${acc}${curr[ContentTypes.TEXT]}\n`;
      }
      return acc;
    }, '');

    message.content = content.trim();
  }

  return messages;
};

module.exports = {
  formatMessage,
  formatFromLangChain,
  formatAgentMessages,
  formatContentStrings,
  formatLangChainMessages,
};
