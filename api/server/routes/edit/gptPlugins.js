const express = require('express');
const router = express.Router();
const { validateTools } = require('~/app');
const { getResponseSender } = require('librechat-data-provider');
const { saveMessage, getConvoTitle, getConvo } = require('~/models');
const { initializeClient } = require('~/server/services/Endpoints/gptPlugins');
const { sendMessage, createOnProgress, formatSteps, formatAction } = require('~/server/utils');
const {
  handleAbort,
  createAbortController,
  handleAbortError,
  setHeaders,
  validateModel,
  validateEndpoint,
  buildEndpointOption,
  moderateText,
} = require('~/server/middleware');
const { logger } = require('~/config');

router.use(moderateText);
router.post('/abort', handleAbort());

router.post(
  '/',
  validateEndpoint,
  validateModel,
  buildEndpointOption,
  setHeaders,
  async (req, res) => {
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

    logger.debug('[/edit/gptPlugins]', {
      text,
      generation,
      isContinued,
      conversationId,
      ...endpointOption,
    });
    let metadata;
    let userMessage;
    let promptTokens;
    let lastSavedTimestamp = 0;
    let saveDelay = 100;
    const sender = getResponseSender({
      ...endpointOption,
      model: endpointOption.modelOptions.model,
    });
    const userMessageId = parentMessageId;
    const user = req.user.id;

    const plugin = {
      loading: true,
      inputs: [],
      latest: null,
      outputs: null,
    };

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
            sender,
            conversationId,
            parentMessageId: overrideParentMessageId || userMessageId,
            text: partialText,
            model: endpointOption.modelOptions.model,
            unfinished: true,
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

    const onAgentAction = (action, start = false) => {
      const formattedAction = formatAction(action);
      plugin.inputs.push(formattedAction);
      plugin.latest = formattedAction.plugin;
      if (!start) {
        saveMessage({ ...userMessage, user });
      }
      sendIntermediateMessage(res, { plugin });
      // logger.debug('PLUGIN ACTION', formattedAction);
    };

    const onChainEnd = (data) => {
      let { intermediateSteps: steps } = data;
      plugin.outputs = steps && steps[0].action ? formatSteps(steps) : 'An error occurred.';
      plugin.loading = false;
      saveMessage({ ...userMessage, user });
      sendIntermediateMessage(res, { plugin });
      // logger.debug('CHAIN END', plugin.outputs);
    };

    const getAbortData = () => ({
      sender,
      conversationId,
      messageId: responseMessageId,
      parentMessageId: overrideParentMessageId ?? userMessageId,
      text: getPartialText(),
      plugin: { ...plugin, loading: false },
      userMessage,
      promptTokens,
    });
    const { abortController, onStart } = createAbortController(req, res, getAbortData);

    try {
      endpointOption.tools = await validateTools(user, endpointOption.tools);
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

      logger.debug('[/edit/gptPlugins] CLIENT RESPONSE', response);
      response.plugin = { ...plugin, loading: false };
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
  },
);

module.exports = router;
