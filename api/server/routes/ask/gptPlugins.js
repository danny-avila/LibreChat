const express = require('express');
const router = express.Router();
const { getResponseSender } = require('../endpoints/schemas');
const { validateTools } = require('../../../app');
const { addTitle } = require('../endpoints/openAI');
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
      endpointOption,
      conversationId,
      parentMessageId = null,
      overrideParentMessageId = null,
    } = req.body;
    console.log('ask log');
    console.dir({ text, conversationId, endpointOption }, { depth: null });
    let metadata;
    let userMessage;
    let userMessageId;
    let responseMessageId;
    let lastSavedTimestamp = 0;
    let saveDelay = 100;
    const newConvo = !conversationId;
    const user = req.user.id;

    const plugins = [];

    const addMetadata = (data) => (metadata = data);
    const getIds = (data) => {
      userMessage = data.userMessage;
      userMessageId = userMessage.messageId;
      responseMessageId = data.responseMessageId;
      if (!conversationId) {
        conversationId = data.conversationId;
      }
    };

    const {
      onProgress: progressCallback,
      sendIntermediateMessage,
      getPartialText,
    } = createOnProgress({
      onProgress: ({ text: partialText }) => {
        const currentTimestamp = Date.now();

        // if (plugin.loading === true) {
        //   plugin.loading = false;
        // }

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
      const latestPlugin = {
        loading: true,
        inputs: [],
        latest: null,
        outputs: null,
      };
      // console.log('PLUGIN ACTION');
      // console.dir(action, { depth: null });
      if (plugins.length > 0) {
        const previousPlugin = plugins[plugins.length - 1];
        previousPlugin.loading = false;
        plugins[plugins.length - 1] = previousPlugin;
      }
      latestPlugin.inputs.push(formattedAction);
      latestPlugin.latest = formattedAction.plugin;
      if (!start) {
        saveMessage(userMessage);
      }

      const extraTokens = ':::plugin:::\n';
      plugins.push(latestPlugin);
      console.log('<---------------onAgentAction PLUGINS--------------->');
      console.log(plugins);

      sendIntermediateMessage(res, { plugins }, extraTokens);
      // console.log('PLUGIN ACTION', formattedAction);
    };

    const onChainEnd = (data) => {
      let { intermediateSteps: steps } = data;
      const latestPlugin = plugins[plugins.length - 1];
      latestPlugin.outputs = steps && steps[0].action ? formatSteps(steps) : 'An error occurred.';
      latestPlugin.loading = false;
      plugins[plugins.length - 1] = latestPlugin;
      saveMessage(userMessage);
      sendIntermediateMessage(res, { plugins });
      // console.log('CHAIN END', plugin.outputs);
      console.log('<---------------onChainEnd PLUGINS--------------->');
      console.log(plugins);
    };

    const getAbortData = () => ({
      sender: getResponseSender(endpointOption),
      conversationId,
      messageId: responseMessageId,
      parentMessageId: overrideParentMessageId ?? userMessageId,
      text: getPartialText(),
      // plugin: { ...plugin, loading: false },
      plugins: plugins.map((p) => ({ ...p, loading: false })),
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
      const { client, azure, openAIApiKey } = initializeClient(req, endpointOption);

      let response = await client.sendMessage(text, {
        user,
        conversationId,
        parentMessageId,
        overrideParentMessageId,
        getIds,
        onAgentAction,
        onChainEnd,
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

      console.log('CLIENT RESPONSE');
      console.dir(response, { depth: null });
      // response.plugin = { ...plugin, loading: false };
      response.plugins = plugins.map((p) => ({ ...p, loading: false }));
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
        azure: !!azure,
      });
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
