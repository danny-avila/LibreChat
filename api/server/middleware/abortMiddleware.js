const { saveMessage, getConvo, getConvoTitle } = require('../../models');
const { sendMessage, handleError } = require('../utils');
const abortControllers = require('./abortControllers');

async function abortMessage(req, res) {
  const { abortKey } = req.body;

  if (!abortControllers.has(abortKey) && !res.headersSent) {
    return res.status(404).send('Request not found');
  }

  const { abortController } = abortControllers.get(abortKey);
  const ret = await abortController.abortCompletion();
  console.log('Aborted request', abortKey);
  abortControllers.delete(abortKey);
  res.send(JSON.stringify(ret));
}

const handleAbort = () => {
  return async (req, res) => {
    try {
      return await abortMessage(req, res);
    } catch (err) {
      console.error(err);
    }
  };
};

const createAbortController = (res, req, endpointOption, getAbortData) => {
  const abortController = new AbortController();
  const onStart = (userMessage) => {
    sendMessage(res, { message: userMessage, created: true });
    const abortKey = userMessage?.conversationId ?? req.user.id;
    abortControllers.set(abortKey, { abortController, ...endpointOption });

    res.on('finish', function () {
      abortControllers.delete(abortKey);
    });
  };

  abortController.abortCompletion = async function () {
    abortController.abort();
    const { conversationId, userMessage, ...responseData } = getAbortData();

    const responseMessage = {
      ...responseData,
      finish_reason: 'incomplete',
      model: endpointOption.modelOptions.model,
      unfinished: false,
      cancelled: true,
      error: false,
    };

    saveMessage(responseMessage);

    return {
      title: await getConvoTitle(req.user.id, conversationId),
      final: true,
      conversation: await getConvo(req.user.id, conversationId),
      requestMessage: userMessage,
      responseMessage: responseMessage,
    };
  };

  return { abortController, onStart };
};

const handleAbortError = async (res, req, error, data) => {
  console.error(error);
  const { sender, conversationId, messageId, parentMessageId, partialText } = data;

  const respondWithError = async () => {
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
    if (abortControllers.has(conversationId)) {
      const { abortController } = abortControllers.get(conversationId);
      abortController.abort();
      abortControllers.delete(conversationId);
    }
    await saveMessage(errorMessage);
    handleError(res, errorMessage);
  };

  if (partialText?.length > 2) {
    try {
      return await abortMessage(req, res);
    } catch (err) {
      return respondWithError();
    }
  } else {
    return respondWithError();
  }
};

module.exports = {
  handleAbort,
  createAbortController,
  handleAbortError,
};
