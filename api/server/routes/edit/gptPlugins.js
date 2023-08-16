const express = require('express');
const router = express.Router();
const { getResponseSender } = require('../endpoints/schemas');
const { validateTools } = require('../../../app');
const { initializeClient } = require('../endpoints/gptPlugins');
const { saveMessage, getConvoTitle, getConvo } = require('../../../models');
const { sendMessage, createOnProgress, formatSteps, formatAction } = require('../../utils');
const {
  handleAbort,
  createAbortController,
  handleAbortError,
  setHeaders,
  requireJwtAuth,
  validateEndpoint,
  buildEndpointOption,
} = require('../../middleware');

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
    const user = req.user.id;

    const plugin = {
      loading: true,
      inputs: [],
      latest: null,
      outputs: null,
    };

    const addMetadata = (data) => (metadata = data);
    const getIds = (data) => (userMessage = data.userMessage);

    const {
      onProgress: progressCallback,
      sendIntermediateMessage,
      getPartialText,
    } = createOnProgress({
      generation,
      onProgress: ({ text: partialText }) => {
        const currentTimestamp = Date.now();

        if (plugin.loading === true) {
          plugin.loading = false;
        }

        if (currentTimestamp - lastSavedTimestamp > saveDelay) {
          lastSavedTimestamp = currentTimestamp;
          saveMessage({
            messageId: responseMessageId,
            sender: getResponseSender(endpointOption),
            conversationId,
            parentMessageId: overrideParentMessageId || userMessageId,
            text: partialText,
            model: endpointOption.modelOptions.model,
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

    const onAgentAction = (action, start = false) => {
      const formattedAction = formatAction(action);
      plugin.inputs.push(formattedAction);
      plugin.latest = formattedAction.plugin;
      if (!start) {
        saveMessage(userMessage);
      }
      sendIntermediateMessage(res, { plugin });
      // console.log('PLUGIN ACTION', formattedAction);
    };

    const onChainEnd = (data) => {
      let { intermediateSteps: steps } = data;
      plugin.outputs = steps && steps[0].action ? formatSteps(steps) : 'An error occurred.';
      plugin.loading = false;
      saveMessage(userMessage);
      sendIntermediateMessage(res, { plugin });
      // console.log('CHAIN END', plugin.outputs);
    };

    const getAbortData = () => ({
      sender: getResponseSender(endpointOption),
      conversationId,
      messageId: responseMessageId,
      parentMessageId: overrideParentMessageId ?? userMessageId,
      text: getPartialText(),
      plugin: { ...plugin, loading: false },
      userMessage,
    });
    const { abortController, onStart } = createAbortController(
      res,
      req,
      endpointOption,
      getAbortData,
    );

    try {
      endpointOption.tools = await validateTools(user, endpointOption.tools);
      const { client } = initializeClient(req, endpointOption);

      let response = await client.sendMessage(text, {
        user,
        isEdited: true,
        conversationId,
        parentMessageId,
        responseMessageId,
        overrideParentMessageId,
        getIds,
        onAgentAction,
        onChainEnd,
        onStart,
        addMetadata,
        ...endpointOption,
        onProgress: progressCallback.call(null, {
          res,
          text,
          plugin,
          parentMessageId: overrideParentMessageId || userMessageId,
        }),
        abortController,
      });

      if (overrideParentMessageId) {
        response.parentMessageId = overrideParentMessageId;
      }

      if (metadata) {
        response = { ...response, ...metadata };
      }

      console.log('CLIENT RESPONSE');
      console.dir(response, { depth: null });
      response.plugin = { ...plugin, loading: false };
      await saveMessage(response);

      sendMessage(res, {
        title: await getConvoTitle(req.user.id, conversationId),
        final: true,
        conversation: await getConvo(req.user.id, conversationId),
        requestMessage: userMessage,
        responseMessage: response,
      });
      res.end();
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
