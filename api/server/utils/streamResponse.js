const crypto = require('crypto');
const { saveMessage, getMessages } = require('~/models/Message');
const { getConvo } = require('~/models/Conversation');

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
 * @param {'message' | 'error' | 'cancel'} event - [Optional] The type of event. Default is 'message'.
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
 * @param {object} options - The options for handling the error containing message properties.
 * @param {function} callback - [Optional] The callback function to be executed.
 */
const sendError = async (res, options, callback) => {
  const {
    user,
    sender,
    conversationId,
    messageId,
    parentMessageId,
    text,
    shouldSaveMessage,
    overrideProps = {},
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
    ...overrideProps,
  };
  if (callback && typeof callback === 'function') {
    await callback();
  }

  if (shouldSaveMessage) {
    await saveMessage({ ...errorMessage, user });
  }

  if (!errorMessage.error) {
    const requestMessage = { messageId: parentMessageId, conversationId };
    const query = await getMessages(requestMessage);
    return sendMessage(res, {
      final: true,
      requestMessage: query?.[0] ? query[0] : requestMessage,
      responseMessage: errorMessage,
      conversation: await getConvo(user, conversationId),
    });
  }

  handleError(res, errorMessage);
};

module.exports = {
  handleError,
  sendMessage,
  sendError,
};
