const crypto = require('crypto');
const { saveMessage } = require('../../models');

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
 * @param {object} res - - The server response.
 * @param {string} message - The message to be sent.
 * @param {string} event - [Optional] The type of event. Default is 'message'.
 */
const sendMessage = (res, message, event = 'message') => {
  if (message.length === 0) {
    return;
  }
  res.write(`event: ${event}\ndata: ${JSON.stringify(message)}\n\n`);
};

/**
 * Processes an error with provided options, saves the error message and sends a corresponding SSE response
 * @async
 * @param {object} res - The server response.
 * @param {object} options - The options for handling the error containing sender, conversationId, messageId, parentMessageId and text properties.
 * @param {function} callback - [Optional] The callback function to be executed.
 */
const sendError = async (res, options, callback) => {
  const { sender, conversationId, messageId, parentMessageId, text } = options;
  const errorMessage = {
    sender,
    messageId: messageId ?? crypto.randomUUID(),
    conversationId,
    parentMessageId,
    unfinished: false,
    cancelled: false,
    error: true,
    final: true,
    text,
    isCreatedByUser: false,
  };
  if (callback && typeof callback === 'function') {
    await callback();
  }
  await saveMessage(errorMessage);
  handleError(res, errorMessage);
};

module.exports = {
  handleError,
  sendMessage,
  sendError,
};
