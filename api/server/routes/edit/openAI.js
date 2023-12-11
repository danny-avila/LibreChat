const express = require('express');
const router = express.Router();
const { getResponseSender } = require('~/server/services/Endpoints');
const { initializeClient } = require('~/server/services/Endpoints/openAI');
const { saveMessage, getConvoTitle, getConvo } = require('~/models');
const { sendMessage, createOnProgress } = require('~/server/utils');
const {
  handleAbort,
  createAbortController,
  handleAbortError,
  setHeaders,
  validateEndpoint,
  buildEndpointOption,
} = require('~/server/middleware');

router.post('/abort', handleAbort());

router.post('/', validateEndpoint, buildEndpointOption, setHeaders, async (req, res) => {
  let {
    text,
    generation,
    endpointOption,
    conversationId,
    responseMessageId,
    isContinued = false,
    parentMessageId = null,
    overrideParentMessageId = null,
  } = req.body;
  console.log('edit log');
  console.dir({ text, generation, isContinued, conversationId, endpointOption }, { depth: null });
  let metadata;
  let userMessage;
  let promptTokens;
  let lastSavedTimestamp = 0;
  let saveDelay = 100;
  const sender = getResponseSender({ ...endpointOption, model: endpointOption.modelOptions.model });
  const userMessageId = parentMessageId;
  const user = req.user.id;

  const addMetadata = (data) => (metadata = data);
  const getReqData = (data = {}) => {
    for (let key in data) {
      if (key === 'userMessage') {
        userMessage = data[key];
      } else if (key === 'responseMessageId') {
        responseMessageId = data[key];
      } else if (key === 'promptTokens') {
        promptTokens = data[key];
      }
    }
  };

  const { onProgress: progressCallback, getPartialText } = createOnProgress({
    generation,
    onProgress: ({ text: partialText }) => {
      const currentTimestamp = Date.now();

      if (currentTimestamp - lastSavedTimestamp > saveDelay) {
        lastSavedTimestamp = currentTimestamp;
        saveMessage({
          messageId: responseMessageId,
          sender,
          conversationId,
          parentMessageId: overrideParentMessageId || userMessageId,
          text: partialText,
          model: endpointOption.modelOptions.model,
          unfinished: true,
          cancelled: false,
          isEdited: true,
          error: false,
          user,
        });
      }

      if (saveDelay < 500) {
        saveDelay = 500;
      }
    },
  });

  const getAbortData = () => ({
    sender,
    conversationId,
    messageId: responseMessageId,
    parentMessageId: overrideParentMessageId ?? userMessageId,
    text: getPartialText(),
    userMessage,
    promptTokens,
  });

  const { abortController, onStart } = createAbortController(req, res, getAbortData);

  try {
    const { client } = await initializeClient({ req, res, endpointOption });

    let response = await client.sendMessage(text, {
      user,
      generation,
      isContinued,
      isEdited: true,
      conversationId,
      parentMessageId,
      responseMessageId,
      overrideParentMessageId,
      getReqData,
      onStart,
      addMetadata,
      abortController,
      onProgress: progressCallback.call(null, {
        res,
        text,
        parentMessageId: overrideParentMessageId || userMessageId,
      }),
    });

    if (metadata) {
      response = { ...response, ...metadata };
    }

    await saveMessage({ ...response, user });

    sendMessage(res, {
      title: await getConvoTitle(user, conversationId),
      final: true,
      conversation: await getConvo(user, conversationId),
      requestMessage: userMessage,
      responseMessage: response,
    });
    res.end();
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
