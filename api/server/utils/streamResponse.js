const crypto = require('crypto');
const { parseConvo } = require('librechat-data-provider');
const { saveMessage, getMessages } = require('~/models/Message');
const { getConvo } = require('~/models/Conversation');
const { logger } = require('~/config');

/**
 * Sends error data in Server Sent Events format and ends the response.
 * @param {object} res - The server response.
 * @param {string} message - The error message.
 */
const handleError = (res, message) => {
  res.write(`event: error\ndata: ${JSON.stringify(message)}\n\n`);
  res.end();
};

/**
 * Sends message data in Server Sent Events format.
 * @param {Express.Response} res - - The server response.
 * @param {string | Object} message - The message to be sent.
 * @param {'message' | 'error' | 'cancel'} event - [Optional] The type of event. Default is 'message'.
 */
const sendMessage = (res, message, event = 'message') => {
  if (typeof message === 'string' && message.length === 0) {
    return;
  }
  res.write(`event: ${event}\ndata: ${JSON.stringify(message)}\n\n`);
};

/**
 * Processes an error with provided options, saves the error message and sends a corresponding SSE response
 * @async
 * @param {object} req - The request.
 * @param {object} res - The response.
 * @param {object} options - The options for handling the error containing message properties.
 * @param {object} options.user - The user ID.
 * @param {string} options.sender - The sender of the message.
 * @param {string} options.conversationId - The conversation ID.
 * @param {string} options.messageId - The message ID.
 * @param {string} options.parentMessageId - The parent message ID.
 * @param {string} options.text - The error message.
 * @param {boolean} options.shouldSaveMessage - [Optional] Whether the message should be saved. Default is true.
 * @param {function} callback - [Optional] The callback function to be executed.
 */
const sendError = async (req, res, options, callback) => {
  const {
    user,
    sender,
    conversationId,
    messageId,
    parentMessageId,
    text,
    shouldSaveMessage,
    ...rest
  } = options;
  const errorMessage = {
    sender,
    messageId: messageId ?? crypto.randomUUID(),
    conversationId,
    parentMessageId,
    unfinished: false,
    error: true,
    final: true,
    text,
    isCreatedByUser: false,
    ...rest,
  };
  if (callback && typeof callback === 'function') {
    await callback();
  }

  if (shouldSaveMessage) {
    await saveMessage(
      req,
      { ...errorMessage, user },
      {
        context: 'api/server/utils/streamResponse.js - sendError',
      },
    );
  }

  if (!errorMessage.error) {
    const requestMessage = { messageId: parentMessageId, conversationId };
    let query = [],
      convo = {};
    try {
      query = await getMessages(requestMessage);
      convo = await getConvo(user, conversationId);
    } catch (err) {
      logger.error('[sendError] Error retrieving conversation data:', err);
      convo = parseConvo(errorMessage);
    }

    return sendMessage(res, {
      final: true,
      requestMessage: query?.[0] ? query[0] : requestMessage,
      responseMessage: errorMessage,
      conversation: convo,
    });
  }

  handleError(res, errorMessage);
};

/**
 * Sends the response based on whether headers have been sent or not.
 * @param {Express.Request} req - The server response.
 * @param {Express.Response} res - The server response.
 * @param {Object} data - The data to be sent.
 * @param {string} [errorMessage] - The error message, if any.
 */
const sendResponse = (req, res, data, errorMessage) => {
  if (!res.headersSent) {
    if (errorMessage) {
      return res.status(500).json({ error: errorMessage });
    }
    return res.json(data);
  }

  if (errorMessage) {
    return sendError(req, res, { ...data, text: errorMessage });
  }
  return sendMessage(res, data);
};

module.exports = {
  sendResponse,
  handleError,
  sendMessage,
  sendError,
};
