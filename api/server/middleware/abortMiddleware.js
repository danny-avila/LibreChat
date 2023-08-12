const { saveMessage } = require('../../models');
const { sendMessage, abortMessage, handleError } = require('../utils');
const abortControllers = require('./abortControllers');

const handleAbort = () => {
  return async (req, res) => {
    try {
      return await abortMessage(req, res, abortControllers);
    } catch (err) {
      console.error(err);
    }
  };
};

const createAbortController = (res, req, endpointOption) => {
  const abortController = new AbortController();
  const onStart = (userMessage) => {
    sendMessage(res, { message: userMessage, created: true });
    abortControllers.set(userMessage.conversationId, { abortController, ...endpointOption });
  };

  return { abortController, onStart };
};

const handleAbortError = async (res, req, error, data) => {
  console.error(error);

  const { sender, conversationId, messageId, parentMessageId, partialText } = data;
  if (partialText?.length > 2) {
    return await abortMessage(req, res, abortControllers);
  } else {
    const errorMessage = {
      sender,
      messageId,
      conversationId,
      parentMessageId,
      unfinished: false,
      cancelled: false,
      error: true,
      text: error.message,
    };
    await saveMessage(errorMessage);
    handleError(res, errorMessage);
  }
};

module.exports = {
  handleAbort,
  createAbortController,
  handleAbortError,
};
