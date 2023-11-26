const express = require('express');
const router = express.Router();
const { getResponseSender } = require('../endpoints/schemas');
const { initializeClient } = require('../endpoints/anthropic');
const {
  handleAbort,
  createAbortController,
  handleAbortError,
  setHeaders,
  validateEndpoint,
  buildEndpointOption,
} = require('~/server/middleware');
const { saveMessage, getConvoTitle, getConvo } = require('~/models');
const { sendMessage, createOnProgress } = require('~/server/utils');

router.post('/abort', handleAbort());

router.post('/', validateEndpoint, buildEndpointOption, setHeaders, async (req, res) => {
  let {
    text,
    endpointOption,
    conversationId,
    parentMessageId = null,
    overrideParentMessageId = null,
  } = req.body;
  console.log('ask log');
  console.dir({ text, conversationId, endpointOption }, { depth: null });
  let userMessage;
  let promptTokens;
  let userMessageId;
  let responseMessageId;
  let lastSavedTimestamp = 0;
  let saveDelay = 100;
  const sender = getResponseSender(endpointOption);
  const user = req.user.id;

  const getReqData = (data = {}) => {
    for (let key in data) {
      if (key === 'userMessage') {
        userMessage = data[key];
        userMessageId = data[key].messageId;
      } else if (key === 'responseMessageId') {
        responseMessageId = data[key];
      } else if (key === 'promptTokens') {
        promptTokens = data[key];
      } else if (!conversationId && key === 'conversationId') {
        conversationId = data[key];
      }
    }
  };

  const { onProgress: progressCallback, getPartialText } = createOnProgress({
    onProgress: ({ text: partialText }) => {
      const currentTimestamp = Date.now();

      if (currentTimestamp - lastSavedTimestamp > saveDelay) {
        lastSavedTimestamp = currentTimestamp;
        saveMessage({
          messageId: responseMessageId,
          sender,
          conversationId,
          parentMessageId: overrideParentMessageId ?? userMessageId,
          text: partialText,
          unfinished: true,
          cancelled: false,
          error: false,
          user,
        });
      }

      if (saveDelay < 500) {
        saveDelay = 500;
      }
    },
  });
  try {
    const getAbortData = () => ({
      conversationId,
      messageId: responseMessageId,
      sender,
      parentMessageId: overrideParentMessageId ?? userMessageId,
      text: getPartialText(),
      userMessage,
      promptTokens,
    });

    const { abortController, onStart } = createAbortController(req, res, getAbortData);

    const { client } = await initializeClient({ req, res, endpointOption });

    let response = await client.sendMessage(text, {
      getReqData,
      // debug: true,
      user,
      conversationId,
      parentMessageId,
      overrideParentMessageId,
      ...endpointOption,
      onProgress: progressCallback.call(null, {
        res,
        text,
        parentMessageId: overrideParentMessageId ?? userMessageId,
      }),
      onStart,
      abortController,
    });

    if (overrideParentMessageId) {
      response.parentMessageId = overrideParentMessageId;
    }

    sendMessage(res, {
      title: await getConvoTitle(user, conversationId),
      final: true,
      conversation: await getConvo(user, conversationId),
      requestMessage: userMessage,
      responseMessage: response,
    });
    res.end();

    await saveMessage({ ...response, user });
    await saveMessage(userMessage);

    // TODO: add anthropic titling
  } catch (error) {
    const partialText = getPartialText();
    handleAbortError(res, req, error, {
      partialText,
      conversationId,
      sender,
      messageId: responseMessageId,
      parentMessageId: userMessageId ?? parentMessageId,
    });
  }
});

module.exports = router;
