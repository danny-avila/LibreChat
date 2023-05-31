const express = require('express');
const router = express.Router();
const { titleConvo } = require('../../../app/');
const { getOpenAIModels } = require('../endpoints');
const ChatAgent = require('../../../app/langchain/ChatAgent');
const { validateTools } = require('../../../app/langchain/tools');
const { saveMessage, getConvoTitle, saveConvo, getConvo } = require('../../../models');
const {
  handleError,
  sendMessage,
  createOnProgress,
  formatSteps,
  formatAction
} = require('./handlers');
const requireJwtAuth = require('../../../middleware/requireJwtAuth');

const abortControllers = new Map();

router.post('/abort', requireJwtAuth, async (req, res) => {
  const { abortKey } = req.body;
  console.log(`req.body`, req.body);
  if (!abortControllers.has(abortKey)) {
    return res.status(404).send('Request not found');
  }

  const { abortController } = abortControllers.get(abortKey);

  abortControllers.delete(abortKey);
  const ret = await abortController.abortAsk();
  console.log('Aborted request', abortKey);
  console.log('Aborted message:', ret);

  res.send(JSON.stringify(ret));
});

router.post('/', requireJwtAuth, async (req, res) => {
  const { endpoint, text, parentMessageId, conversationId } = req.body;
  if (text.length === 0) return handleError(res, { text: 'Prompt empty or too short' });
  if (endpoint !== 'gptPlugins') return handleError(res, { text: 'Illegal request' });

  const agentOptions = req.body?.agentOptions ?? {
    model: 'gpt-3.5-turbo',
    // model: 'gpt-4', // for agent model
    temperature: 0,
    top_p: 1,
    presence_penalty: 0,
    frequency_penalty: 0
  };
  
  const tools = req.body?.tools.map((tool) => tool.pluginKey) ?? [];
  // build endpoint option
  const endpointOption = {
    modelOptions: {
      model: req.body?.model ?? 'gpt-4',
      chatGptLabel: tools.length === 0 ? req.body?.chatGptLabel ?? null : null,
      promptPrefix: tools.length === 0 ? req.body?.promptPrefix ?? null : null,
      temperature: req.body?.temperature ?? 0,
      top_p: req.body?.top_p ?? 1,
      presence_penalty: req.body?.presence_penalty ?? 0,
      frequency_penalty: req.body?.frequency_penalty ?? 0
    },
    agentOptions
  };

  const availableModels = getOpenAIModels();
  if (availableModels.find((model) => model === endpointOption.modelOptions.model) === undefined) {
    return handleError(res, { text: `Illegal request: model` });
  }

  // console.log('ask log', {
  //   text,
  //   conversationId,
  //   endpointOption
  // });

  console.log('ask log');
  console.dir({ text, conversationId, endpointOption }, { depth: null });

  // eslint-disable-next-line no-use-before-define
  return await ask({
    text,
    endpointOption,
    conversationId,
    parentMessageId,
    req,
    res
  });
});

const ask = async ({ text, endpointOption, parentMessageId = null, conversationId, req, res }) => {
  res.writeHead(200, {
    Connection: 'keep-alive',
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Access-Control-Allow-Origin': '*',
    'X-Accel-Buffering': 'no'
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
    outputs: null
  };

  const { tools } = endpointOption;
  delete endpointOption.tools;

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
            unfinished: false,
            cancelled: true,
            error: false
          });
        }
      }
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
        responseMessage: responseMessage
      };
    };

    const onStart = (userMessage) => {
      sendMessage(res, { message: userMessage, created: true });
      abortControllers.set(userMessage.conversationId, { abortController, ...endpointOption });
    }

    const clientOptions = {
      debug: true,
      reverseProxyUrl: process.env.OPENAI_REVERSE_PROXY || null,
      proxy: process.env.PROXY || null,
      ...endpointOption
    };

    clientOptions.tools = await validateTools(user, tools);

    if (process.env.AZURE_OPENAI_API_KEY) {
      clientOptions.azure = {
        azureOpenAIApiKey: process.env.AZURE_OPENAI_API_KEY,
        azureOpenAIApiInstanceName: process.env.AZURE_OPENAI_API_INSTANCE_NAME,
        azureOpenAIApiDeploymentName: process.env.AZURE_OPENAI_API_DEPLOYMENT_NAME,
        azureOpenAIApiVersion: process.env.AZURE_OPENAI_API_VERSION
      };
    }

    const chatAgent = new ChatAgent(process.env.OPENAI_KEY, clientOptions);

    const onAgentAction = (action) => {
      const formattedAction = formatAction(action);
      plugin.inputs.push(formattedAction);
      plugin.latest = formattedAction.plugin;
      saveMessage(userMessage);
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
      onProgress: progressCallback.call(null, {
        res,
        text,
        plugin,
        parentMessageId: overrideParentMessageId || userMessageId
      }),
      abortController
    });

    if (overrideParentMessageId) {
      response.parentMessageId = overrideParentMessageId;
    }

    // console.log('CLIENT RESPONSE');
    // console.dir(response, { depth: null });
    response.plugin = { ...plugin, loading: false };
    await saveMessage(response);

    sendMessage(res, {
      title: await getConvoTitle(req.user.id, conversationId),
      final: true,
      conversation: await getConvo(req.user.id, conversationId),
      requestMessage: userMessage,
      responseMessage: response
    });
    res.end();

    if (parentMessageId == '00000000-0000-0000-0000-000000000000' && newConvo) {
      const title = await titleConvo({ text, response });
      await saveConvo(req.user.id, {
        conversationId: conversationId,
        title
      });
    }
  } catch (error) {
    console.error(error);
    const errorMessage = {
      messageId: responseMessageId,
      sender: 'ChatGPT',
      conversationId,
      parentMessageId,
      unfinished: false,
      cancelled: false,
      error: true,
      text: error.message
    };
    await saveMessage(errorMessage);
    handleError(res, errorMessage);
  }
};

module.exports = router;
