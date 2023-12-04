const { sendMessage, sendError, countTokens, isEnabled } = require('~/server/utils');
const { saveMessage, getConvo, getConvoTitle } = require('~/models');
const clearPendingReq = require('~/cache/clearPendingReq');
const abortControllers = require('./abortControllers');
const spendTokens = require('~/models/spendTokens');

async function abortMessage(req, res) {
  const { abortKey } = req.body;

  if (!abortControllers.has(abortKey) && !res.headersSent) {
    return res.status(404).send({ message: 'Request not found' });
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
      if (isEnabled(process.env.LIMIT_CONCURRENT_MESSAGES)) {
        await clearPendingReq({ userId: req.user.id });
      }
      return await abortMessage(req, res);
    } catch (err) {
      console.error(err);
    }
  };
};

const createAbortController = (req, res, getAbortData) => {
  const abortController = new AbortController();
  const { endpointOption } = req.body;
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
    const { conversationId, userMessage, promptTokens, ...responseData } = getAbortData();
    const completionTokens = await countTokens(responseData?.text ?? '');
    const user = req.user.id;

    const responseMessage = {
      ...responseData,
      conversationId,
      finish_reason: 'incomplete',
      model: endpointOption.modelOptions.model,
      unfinished: false,
      cancelled: true,
      error: false,
      isCreatedByUser: false,
      tokenCount: completionTokens,
    };

    await spendTokens(
      { ...responseMessage, context: 'incomplete', user },
      { promptTokens, completionTokens },
    );

    saveMessage({ ...responseMessage, user });

    return {
      title: await getConvoTitle(user, conversationId),
      final: true,
      conversation: await getConvo(user, conversationId),
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
    const options = {
      sender,
      messageId,
      conversationId,
      parentMessageId,
      text: error.message,
      shouldSaveMessage: true,
      user: req.user.id,
    };
    const callback = async () => {
      if (abortControllers.has(conversationId)) {
        const { abortController } = abortControllers.get(conversationId);
        abortController.abort();
        abortControllers.delete(conversationId);
      }
    };

    await sendError(res, options, callback);
  };

  if (partialText && partialText.length > 5) {
    try {
      return await abortMessage(req, res);
    } catch (err) {
      console.error(err);
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
