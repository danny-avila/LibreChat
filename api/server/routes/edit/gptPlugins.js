const express = require('express');
const { getResponseSender } = require('librechat-data-provider');
const {
  setHeaders,
  moderateText,
  validateModel,
  handleAbortError,
  validateEndpoint,
  buildEndpointOption,
  createAbortController,
} = require('~/server/middleware');
const { sendMessage, createOnProgress, formatSteps, formatAction } = require('~/server/utils');
const { initializeClient } = require('~/server/services/Endpoints/gptPlugins');
const { saveMessage, updateMessage } = require('~/models');
const { validateTools } = require('~/app');
const { logger } = require('~/config');

const router = express.Router();

router.use(moderateText);

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
    let userMessagePromise;
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
        } else if (key === 'userMessagePromise') {
          userMessagePromise = data[key];
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
      onProgress: () => {
        if (plugin.loading === true) {
          plugin.loading = false;
        }
      },
    });

    const onChainEnd = (data) => {
      let { intermediateSteps: steps } = data;
      plugin.outputs = steps && steps[0].action ? formatSteps(steps) : 'An error occurred.';
      plugin.loading = false;
      saveMessage(
        req,
        { ...userMessage, user },
        { context: 'api/server/routes/ask/gptPlugins.js - onChainEnd' },
      );
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
      userMessagePromise,
      messageId: responseMessageId,
      parentMessageId: overrideParentMessageId ?? userMessageId,
      text: getPartialText(),
      plugin: { ...plugin, loading: false },
      userMessage,
      promptTokens,
    });
    const { abortController, onStart } = createAbortController(req, res, getAbortData, getReqData);

    try {
      endpointOption.tools = await validateTools(user, endpointOption.tools);
      const { client } = await initializeClient({ req, res, endpointOption });

      const onAgentAction = (action, start = false) => {
        const formattedAction = formatAction(action);
        plugin.inputs.push(formattedAction);
        plugin.latest = formattedAction.plugin;
        if (!start && !client.skipSaveUserMessage) {
          saveMessage(
            req,
            { ...userMessage, user },
            { context: 'api/server/routes/ask/gptPlugins.js - onAgentAction' },
          );
        }
        sendIntermediateMessage(res, {
          plugin,
          parentMessageId: userMessage.messageId,
          messageId: responseMessageId,
        });
        // logger.debug('PLUGIN ACTION', formattedAction);
      };

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
          plugin,
          // parentMessageId: overrideParentMessageId || userMessageId,
        },
        abortController,
      });

      if (overrideParentMessageId) {
        response.parentMessageId = overrideParentMessageId;
      }

      logger.debug('[/edit/gptPlugins] CLIENT RESPONSE', response);

      const { conversation = {} } = await response.databasePromise;
      delete response.databasePromise;
      conversation.title =
        conversation && !conversation.title ? null : conversation?.title || 'New Chat';

      sendMessage(res, {
        title: conversation.title,
        final: true,
        conversation,
        requestMessage: userMessage,
        responseMessage: response,
      });
      res.end();

      response.plugin = { ...plugin, loading: false };
      await updateMessage(
        req,
        { ...response, user },
        { context: 'api/server/routes/edit/gptPlugins.js' },
      );
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
