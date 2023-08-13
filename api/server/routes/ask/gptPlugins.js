const express = require('express');
const router = express.Router();
const { validateTools } = require('../../../app');
const { addTitle } = require('../endpoints/openAI');
const { buildOptions, initializeClient } = require('../endpoints/gptPlugins');
const { saveMessage, getConvoTitle, getConvo } = require('../../../models');
const { sendMessage, createOnProgress, formatSteps, formatAction } = require('../../utils');
const {
  handleAbort,
  createAbortController,
  handleAbortError,
  setHeaders,
  requireJwtAuth,
} = require('../../middleware');

router.post('/abort', requireJwtAuth, handleAbort());

router.post('/', requireJwtAuth, setHeaders, async (req, res) => {
  let { text, endpointOption, conversationId, parentMessageId = null } = buildOptions(req, res);
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
    sender: endpointOption?.chatGptLabel ?? 'ChatGPT',
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
    const { client, azure, openAIApiKey } = initializeClient(req, endpointOption);

    let response = await client.sendMessage(text, {
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
      sender: 'ChatGPT',
      messageId: responseMessageId,
      parentMessageId: userMessageId,
    });
  }
});

module.exports = router;
