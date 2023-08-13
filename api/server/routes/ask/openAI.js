const express = require('express');
const router = express.Router();
const { sendMessage, createOnProgress } = require('../../utils');
const { addTitle, buildOptions, initializeClient } = require('../endpoints/openAI');
const { saveMessage, getConvoTitle, getConvo } = require('../../../models');
const {
  handleAbort,
  createAbortController,
  handleAbortError,
  setHeaders,
  requireJwtAuth,
} = require('../../middleware');

router.post('/abort', requireJwtAuth, handleAbort());

router.post('/', requireJwtAuth, setHeaders, async (req, res) => {
  let { text, endpointOption, conversationId, parentMessageId = null } = buildOptions(req, res);
  let metadata;
  let userMessage;
  let userMessageId;
  let responseMessageId;
  let lastSavedTimestamp = 0;
  const newConvo = !conversationId;
  const { overrideParentMessageId = null } = req.body;
  const user = req.user.id;

  const addMetadata = (data) => (metadata = data);

  const getIds = (data) => {
    userMessage = data.userMessage;
    userMessageId = userMessage.messageId;
    responseMessageId = data.responseMessageId;
    if (!conversationId) {
      conversationId = data.conversationId;
    }
  };

  const { onProgress: progressCallback, getPartialText } = createOnProgress({
    onProgress: ({ text: partialText }) => {
      const currentTimestamp = Date.now();

      if (currentTimestamp - lastSavedTimestamp > 500) {
        lastSavedTimestamp = currentTimestamp;
        saveMessage({
          messageId: responseMessageId,
          sender: 'ChatGPT',
          conversationId,
          parentMessageId: overrideParentMessageId || userMessageId,
          text: partialText,
          model: endpointOption.modelOptions.model,
          unfinished: true,
          cancelled: false,
          error: false,
        });
      }
    },
  });

  const getAbortData = () => ({
    sender: endpointOption?.chatGptLabel ?? 'ChatGPT',
    conversationId,
    messageId: responseMessageId,
    parentMessageId: overrideParentMessageId ?? userMessageId,
    text: getPartialText(),
    userMessage,
  });

  const { abortController, onStart } = createAbortController(
    res,
    req,
    endpointOption,
    getAbortData,
  );

  try {
    const { client, openAIApiKey } = initializeClient(req, endpointOption);

    let response = await client.sendMessage(text, {
      user,
      parentMessageId,
      conversationId,
      overrideParentMessageId,
      getIds,
      onStart,
      addMetadata,
      abortController,
      onProgress: progressCallback.call(null, {
        res,
        text,
        parentMessageId: overrideParentMessageId || userMessageId,
      }),
    });

    if (overrideParentMessageId) {
      response.parentMessageId = overrideParentMessageId;
    }

    if (metadata) {
      response = { ...response, ...metadata };
    }

    console.log(
      'promptTokens, completionTokens:',
      response.promptTokens,
      response.completionTokens,
    );
    await saveMessage(response);

    sendMessage(res, {
      title: await getConvoTitle(req.user.id, conversationId),
      final: true,
      conversation: await getConvo(req.user.id, conversationId),
      requestMessage: userMessage,
      responseMessage: response,
    });
    res.end();

    addTitle(req, {
      text,
      newConvo,
      response,
      openAIApiKey,
      parentMessageId,
      azure: endpointOption.endpoint === 'azureOpenAI',
    });
  } catch (error) {
    const partialText = getPartialText();
    handleAbortError(res, req, error, {
      partialText,
      conversationId,
      sender: 'ChatGPT',
      messageId: responseMessageId,
      parentMessageId: userMessageId,
    });
  }
});

module.exports = router;
