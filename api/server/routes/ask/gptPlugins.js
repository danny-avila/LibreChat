const express = require('express');
const router = express.Router();
const { titleConvo, validateTools, PluginsClient } = require('../../../app');
const { abortMessage, getAzureCredentials } = require('../../../utils');
const { saveMessage, getConvoTitle, saveConvo, getConvo } = require('../../../models');
const {
  handleError,
  sendMessage,
  createOnProgress,
  formatSteps,
  formatAction,
} = require('./handlers');
const requireJwtAuth = require('../../../middleware/requireJwtAuth');

const abortControllers = new Map();

router.post('/abort', requireJwtAuth, async (req, res) => {
  return await abortMessage(req, res, abortControllers);
});

router.post('/', requireJwtAuth, async (req, res) => {
  const { endpoint, text, parentMessageId, conversationId } = req.body;
  if (text.length === 0) {
    return handleError(res, { text: 'Prompt empty or too short' });
  }
  if (endpoint !== 'gptPlugins') {
    return handleError(res, { text: 'Illegal request' });
  }

  const agentOptions = req.body?.agentOptions ?? {
    agent: 'functions',
    skipCompletion: true,
    model: 'gpt-3.5-turbo',
    temperature: 0,
    // top_p: 1,
    // presence_penalty: 0,
    // frequency_penalty: 0
  };

  const tools = req.body?.tools.map((tool) => tool.pluginKey) ?? [];
  // build endpoint option
  const endpointOption = {
    chatGptLabel: tools.length === 0 ? req.body?.chatGptLabel ?? null : null,
    promptPrefix: tools.length === 0 ? req.body?.promptPrefix ?? null : null,
    tools,
    modelOptions: {
      model: req.body?.model ?? 'gpt-4',
      temperature: req.body?.temperature ?? 0,
      top_p: req.body?.top_p ?? 1,
      presence_penalty: req.body?.presence_penalty ?? 0,
      frequency_penalty: req.body?.frequency_penalty ?? 0,
    },
    agentOptions: {
      ...agentOptions,
      // agent: 'functions'
    },
  };

  console.log('ask log');
  console.dir({ text, conversationId, endpointOption }, { depth: null });

  // eslint-disable-next-line no-use-before-define
  return await ask({
    text,
    endpoint,
    endpointOption,
    conversationId,
    parentMessageId,
    req,
    res,
  });
});

const ask = async ({ text, endpoint, endpointOption, parentMessageId = null, conversationId, req, res }) => {
  res.writeHead(200, {
    Connection: 'keep-alive',
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Access-Control-Allow-Origin': '*',
    'X-Accel-Buffering': 'no',
  });
  let userMessage;
  let userMessageId;
  let responseMessageId;
  let lastSavedTimestamp = 0;
  const newConvo = !conversationId;
  const { overrideParentMessageId = null } = req.body;
  const user = req.user.id;

  const plugin = {
    loading: true,
    inputs: [],
    latest: null,
    outputs: null,
  };

  try {
    const getIds = (data) => {
      userMessage = data.userMessage;
      userMessageId = userMessage.messageId;
      responseMessageId = data.responseMessageId;
      if (!conversationId) {
        conversationId = data.conversationId;
      }
    };

    const { onProgress: progressCallback, sendIntermediateMessage, getPartialText } = createOnProgress({
      onProgress: ({ text: partialText }) => {
        const currentTimestamp = Date.now();

        if (plugin.loading === true) {
          plugin.loading = false;
        }

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

    const abortController = new AbortController();
    abortController.abortAsk = async function () {
      this.abort();

      const responseMessage = {
        messageId: responseMessageId,
        sender: endpointOption?.chatGptLabel || 'ChatGPT',
        conversationId,
        parentMessageId: overrideParentMessageId || userMessageId,
        text: getPartialText(),
        plugin: { ...plugin, loading: false },
        model: endpointOption.modelOptions.model,
        unfinished: false,
        cancelled: true,
        error: false,
      };

      saveMessage(responseMessage);

      return {
        title: await getConvoTitle(req.user.id, conversationId),
        final: true,
        conversation: await getConvo(req.user.id, conversationId),
        requestMessage: userMessage,
        responseMessage: responseMessage,
      };
    };

    const onStart = (userMessage) => {
      sendMessage(res, { message: userMessage, created: true });
      abortControllers.set(userMessage.conversationId, { abortController, ...endpointOption });
    };

    endpointOption.tools = await validateTools(user, endpointOption.tools);
    const clientOptions = {
      debug: true,
      endpoint,
      reverseProxyUrl: process.env.OPENAI_REVERSE_PROXY || null,
      proxy: process.env.PROXY || null,
      ...endpointOption,
    };

    let openAIApiKey = req.body?.token ?? process.env.OPENAI_API_KEY;
    if (process.env.PLUGINS_USE_AZURE) {
      clientOptions.azure = getAzureCredentials();
      openAIApiKey = clientOptions.azure.azureOpenAIApiKey;
    }

    if (openAIApiKey && openAIApiKey.includes('azure') && !clientOptions.azure) {
      clientOptions.azure = JSON.parse(req.body?.token) ?? getAzureCredentials();
      openAIApiKey = clientOptions.azure.azureOpenAIApiKey;
    }
    const chatAgent = new PluginsClient(openAIApiKey, clientOptions);

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

    let response = await chatAgent.sendMessage(text, {
      getIds,
      user,
      parentMessageId,
      conversationId,
      overrideParentMessageId,
      onAgentAction,
      onChainEnd,
      onStart,
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

    if (parentMessageId == '00000000-0000-0000-0000-000000000000' && newConvo) {
      const title = await titleConvo({
        text,
        response,
        openAIApiKey,
        azure: !!clientOptions.azure,
      });
      await saveConvo(req.user.id, {
        conversationId: conversationId,
        title,
      });
    }
  } catch (error) {
    console.error(error);
    const errorMessage = {
      messageId: responseMessageId,
      sender: 'ChatGPT',
      conversationId,
      parentMessageId: userMessageId,
      unfinished: false,
      cancelled: false,
      error: true,
      text: error.message,
    };
    await saveMessage(errorMessage);
    handleError(res, errorMessage);
  }
};

module.exports = router;
