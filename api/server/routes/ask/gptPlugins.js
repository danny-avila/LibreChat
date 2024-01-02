const express = require('express');
const router = express.Router();
const { getResponseSender } = require('librechat-data-provider');
const { validateTools } = require('~/app');
const { addTitle } = require('~/server/services/Endpoints/openAI');
const { initializeClient } = require('~/server/services/Endpoints/gptPlugins');
const { saveMessage, getConvoTitle, getConvo } = require('~/models');
const { sendMessage, createOnProgress } = require('~/server/utils');
const {
  handleAbort,
  createAbortController,
  handleAbortError,
  setHeaders,
  validateEndpoint,
  buildEndpointOption,
  moderateText,
} = require('~/server/middleware');
const { logger } = require('~/config');

router.use(moderateText);
router.post('/abort', handleAbort());

router.post('/', validateEndpoint, buildEndpointOption, setHeaders, async (req, res) => {
  let {
    text,
    endpointOption,
    conversationId,
    parentMessageId = null,
    overrideParentMessageId = null,
  } = req.body;
  logger.debug('[/ask/gptPlugins]', { text, conversationId, ...endpointOption });
  let metadata;
  let userMessage;
  let promptTokens;
  let userMessageId;
  let responseMessageId;
  let lastSavedTimestamp = 0;
  let saveDelay = 100;
  const sender = getResponseSender({ ...endpointOption, model: endpointOption.modelOptions.model });
  const newConvo = !conversationId;
  const user = req.user.id;

  const plugins = [];

  const addMetadata = (data) => (metadata = data);
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

  let streaming = null;
  let timer = null;

  const {
    onProgress: progressCallback,
    sendIntermediateMessage,
    getPartialText,
  } = createOnProgress({
    onProgress: ({ text: partialText }) => {
      const currentTimestamp = Date.now();

      if (timer) {
        clearTimeout(timer);
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
          error: false,
          plugins,
          user,
        });
      }

      if (saveDelay < 500) {
        saveDelay = 500;
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
    sendIntermediateMessage(res, { plugins });
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
    sendIntermediateMessage(res, { plugins }, extraTokens);
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

  const onChainEnd = () => {
    saveMessage({ ...userMessage, user });
    sendIntermediateMessage(res, { plugins });
  };

  const getAbortData = () => ({
    sender,
    conversationId,
    messageId: responseMessageId,
    parentMessageId: overrideParentMessageId ?? userMessageId,
    text: getPartialText(),
    plugins: plugins.map((p) => ({ ...p, loading: false })),
    userMessage,
    promptTokens,
  });
  const { abortController, onStart } = createAbortController(req, res, getAbortData);

  try {
    endpointOption.tools = await validateTools(user, endpointOption.tools);
    const { client } = await initializeClient({ req, res, endpointOption });

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
      addMetadata,
      getPartialText,
      ...endpointOption,
      onProgress: progressCallback.call(null, {
        res,
        text,
        parentMessageId: overrideParentMessageId || userMessageId,
        plugins,
      }),
      abortController,
    });

    if (overrideParentMessageId) {
      response.parentMessageId = overrideParentMessageId;
    }

    if (metadata) {
      response = { ...response, ...metadata };
    }

    logger.debug('[/ask/gptPlugins]', response);

    response.plugins = plugins.map((p) => ({ ...p, loading: false }));
    await saveMessage({ ...response, user });

    sendMessage(res, {
      title: await getConvoTitle(user, conversationId),
      final: true,
      conversation: await getConvo(user, conversationId),
      requestMessage: userMessage,
      responseMessage: response,
    });
    res.end();

    if (parentMessageId === '00000000-0000-0000-0000-000000000000' && newConvo) {
      addTitle(req, {
        text,
        response,
        client,
      });
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
});

module.exports = router;
