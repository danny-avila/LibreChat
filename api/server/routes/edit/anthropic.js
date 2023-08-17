const express = require('express');
const router = express.Router();
const { getResponseSender } = require('../endpoints/schemas');
const { initializeClient } = require('../endpoints/anthropic');
const {
  handleAbort,
  createAbortController,
  handleAbortError,
  setHeaders,
  requireJwtAuth,
  validateEndpoint,
  buildEndpointOption,
} = require('../../middleware');
const { saveMessage, getConvoTitle, getConvo } = require('../../../models');
const { sendMessage, createOnProgress } = require('../../utils');

router.post('/abort', requireJwtAuth, handleAbort());

router.post(
  '/',
  requireJwtAuth,
  validateEndpoint,
  buildEndpointOption,
  setHeaders,
  async (req, res) => {
    let {
      text,
      generation,
      endpointOption,
      conversationId,
      responseMessageId,
      parentMessageId = null,
      overrideParentMessageId = null,
    } = req.body;
    console.log('edit log');
    console.dir({ text, conversationId, endpointOption }, { depth: null });
    let metadata;
    let userMessage;
    let lastSavedTimestamp = 0;
    let saveDelay = 100;
    const userMessageId = parentMessageId;

    const addMetadata = (data) => (metadata = data);
    const getIds = (data) => (userMessage = data.userMessage);

    const { onProgress: progressCallback, getPartialText } = createOnProgress({
      generation,
      onProgress: ({ text: partialText }) => {
        const currentTimestamp = Date.now();
        if (currentTimestamp - lastSavedTimestamp > saveDelay) {
          lastSavedTimestamp = currentTimestamp;
          saveMessage({
            messageId: responseMessageId,
            sender: getResponseSender(endpointOption),
            conversationId,
            parentMessageId: overrideParentMessageId ?? userMessageId,
            text: partialText,
            unfinished: true,
            cancelled: false,
            error: false,
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
        sender: getResponseSender(endpointOption),
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

      const { client } = initializeClient(req, endpointOption);

      let response = await client.sendMessage(text, {
        user: req.user.id,
        isEdited: true,
        conversationId,
        parentMessageId,
        responseMessageId,
        overrideParentMessageId,
        ...endpointOption,
        onProgress: progressCallback.call(null, {
          res,
          text,
          parentMessageId: overrideParentMessageId ?? userMessageId,
        }),
        getIds,
        onStart,
        addMetadata,
        abortController,
      });

      if (metadata) {
        response = { ...response, ...metadata };
      }

      if (overrideParentMessageId) {
        response.parentMessageId = overrideParentMessageId;
      }

      await saveMessage(response);
      sendMessage(res, {
        title: await getConvoTitle(req.user.id, conversationId),
        final: true,
        conversation: await getConvo(req.user.id, conversationId),
        requestMessage: userMessage,
        responseMessage: response,
      });
      res.end();

      // TODO: add anthropic titling
    } catch (error) {
      const partialText = getPartialText();
      handleAbortError(res, req, error, {
        partialText,
        conversationId,
        sender: getResponseSender(endpointOption),
        messageId: responseMessageId,
        parentMessageId: userMessageId,
      });
    }
  },
);

module.exports = router;
