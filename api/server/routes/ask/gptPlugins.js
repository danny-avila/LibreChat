const express = require('express');
const { getResponseSender, Constants } = require('librechat-data-provider');
const { initializeClient } = require('~/server/services/Endpoints/gptPlugins');
const { sendMessage, createOnProgress } = require('~/server/utils');
const { addTitle } = require('~/server/services/Endpoints/openAI');
const { saveMessage, updateMessage } = require('~/models');
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
      endpointOption,
      conversationId,
      parentMessageId = null,
      overrideParentMessageId = null,
    } = req.body;

    logger.debug('[/ask/gptPlugins]', { text, conversationId, ...endpointOption });

    let userMessage;
    let userMessagePromise;
    let promptTokens;
    let userMessageId;
    let responseMessageId;
    const sender = getResponseSender({
      ...endpointOption,
      model: endpointOption.modelOptions.model,
    });
    const newConvo = !conversationId;
    const user = req.user.id;

    const plugins = [];

    const getReqData = (data = {}) => {
      for (let key in data) {
        if (key === 'userMessage') {
          userMessage = data[key];
          userMessageId = data[key].messageId;
        } else if (key === 'userMessagePromise') {
          userMessagePromise = data[key];
        } else if (key === 'responseMessageId') {
          responseMessageId = data[key];
        } else if (key === 'promptTokens') {
          promptTokens = data[key];
        } else if (!conversationId && key === 'conversationId') {
          conversationId = data[key];
        }
      }
    };

    let streaming = null;
    let timer = null;

    const {
      onProgress: progressCallback,
      sendIntermediateMessage,
      getPartialText,
    } = createOnProgress({
      onProgress: () => {
        if (timer) {
          clearTimeout(timer);
        }

        streaming = new Promise((resolve) => {
          timer = setTimeout(() => {
            resolve();
          }, 250);
        });
      },
    });

    const pluginMap = new Map();
    const onAgentAction = async (action, runId) => {
      pluginMap.set(runId, action.tool);
      sendIntermediateMessage(res, {
        plugins,
        parentMessageId: userMessage.messageId,
        messageId: responseMessageId,
      });
    };

    const onToolStart = async (tool, input, runId, parentRunId) => {
      const pluginName = pluginMap.get(parentRunId);
      const latestPlugin = {
        runId,
        loading: true,
        inputs: [input],
        latest: pluginName,
        outputs: null,
      };

      if (streaming) {
        await streaming;
      }
      const extraTokens = ':::plugin:::\n';
      plugins.push(latestPlugin);
      sendIntermediateMessage(
        res,
        { plugins, parentMessageId: userMessage.messageId, messageId: responseMessageId },
        extraTokens,
      );
    };

    const onToolEnd = async (output, runId) => {
      if (streaming) {
        await streaming;
      }

      const pluginIndex = plugins.findIndex((plugin) => plugin.runId === runId);

      if (pluginIndex !== -1) {
        plugins[pluginIndex].loading = false;
        plugins[pluginIndex].outputs = output;
      }
    };

    const getAbortData = () => ({
      sender,
      conversationId,
      userMessagePromise,
      messageId: responseMessageId,
      parentMessageId: overrideParentMessageId ?? userMessageId,
      text: getPartialText(),
      plugins: plugins.map((p) => ({ ...p, loading: false })),
      userMessage,
      promptTokens,
    });
    const { abortController, onStart } = createAbortController(req, res, getAbortData, getReqData);

    try {
      endpointOption.tools = await validateTools(user, endpointOption.tools);
      const { client } = await initializeClient({ req, res, endpointOption });

      const onChainEnd = () => {
        if (!client.skipSaveUserMessage) {
          saveMessage(
            req,
            { ...userMessage, user },
            { context: 'api/server/routes/ask/gptPlugins.js - onChainEnd' },
          );
        }
        sendIntermediateMessage(res, {
          plugins,
          parentMessageId: userMessage.messageId,
          messageId: responseMessageId,
        });
      };

      let response = await client.sendMessage(text, {
        user,
        conversationId,
        parentMessageId,
        overrideParentMessageId,
        getReqData,
        onAgentAction,
        onChainEnd,
        onToolStart,
        onToolEnd,
        onStart,
        getPartialText,
        ...endpointOption,
        progressCallback,
        progressOptions: {
          res,
          // parentMessageId: overrideParentMessageId || userMessageId,
          plugins,
        },
        abortController,
      });

      if (overrideParentMessageId) {
        response.parentMessageId = overrideParentMessageId;
      }

      logger.debug('[/ask/gptPlugins]', response);

      const { conversation = {} } = await client.responsePromise;
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

      if (parentMessageId === Constants.NO_PARENT && newConvo) {
        addTitle(req, {
          text,
          response,
          client,
        });
      }

      response.plugins = plugins.map((p) => ({ ...p, loading: false }));
      if (response.plugins?.length > 0) {
        await updateMessage(
          req,
          { ...response, user },
          { context: 'api/server/routes/ask/gptPlugins.js - save plugins used' },
        );
      }
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
