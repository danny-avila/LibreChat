const express = require('express');
const throttle = require('lodash/throttle');
const { getResponseSender } = require('librechat-data-provider');
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
const { sendMessage, createOnProgress, formatSteps, formatAction } = require('~/server/utils');
const { initializeClient } = require('~/server/services/Endpoints/gptPlugins');
const { saveMessage, getConvoTitle, getConvo } = require('~/models');
const { validateTools } = require('~/app');
const { logger } = require('~/config');

const router = express.Router();

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

    let userMessage;
    let promptTokens;
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

    const throttledSaveMessage = throttle(saveMessage, 3000, { trailing: false });
    const {
      onProgress: progressCallback,
      sendIntermediateMessage,
      getPartialText,
    } = createOnProgress({
      generation,
      onProgress: ({ text: partialText }) => {
        if (plugin.loading === true) {
          plugin.loading = false;
        }

        throttledSaveMessage({
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
      },
    });

    const onAgentAction = (action, start = false) => {
      const formattedAction = formatAction(action);
      plugin.inputs.push(formattedAction);
      plugin.latest = formattedAction.plugin;
      if (!start) {
        saveMessage({ ...userMessage, user });
      }
      sendIntermediateMessage(res, {
        plugin,
        parentMessageId: userMessage.messageId,
        messageId: responseMessageId,
      });
      // logger.debug('PLUGIN ACTION', formattedAction);
    };

    const onChainEnd = (data) => {
      let { intermediateSteps: steps } = data;
      plugin.outputs = steps && steps[0].action ? formatSteps(steps) : 'An error occurred.';
      plugin.loading = false;
      saveMessage({ ...userMessage, user });
      sendIntermediateMessage(res, {
        plugin,
        parentMessageId: userMessage.messageId,
        messageId: responseMessageId,
      });
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
        ...endpointOption,
        progressCallback,
        progressOptions: {
          res,
          text,
          plugin,
          // parentMessageId: overrideParentMessageId || userMessageId,
        },
        abortController,
      });

      if (overrideParentMessageId) {
        response.parentMessageId = overrideParentMessageId;
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
