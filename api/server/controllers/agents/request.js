const { Constants, getResponseSender } = require('librechat-data-provider');
const { createAbortController, handleAbortError } = require('~/server/middleware');
const { sendMessage } = require('~/server/utils');
const { saveMessage } = require('~/models');
const { logger } = require('~/config');

const AgentController = async (req, res, next, initializeClient, addTitle) => {
  let {
    text,
    endpointOption,
    conversationId,
    modelDisplayLabel,
    parentMessageId = null,
    overrideParentMessageId = null,
  } = req.body;

  let userMessage;
  let userMessagePromise;
  let promptTokens;
  let userMessageId;
  let responseMessageId;

  const sender = getResponseSender({
    ...endpointOption,
    model: endpointOption.model_parameters.model,
    modelDisplayLabel,
  });
  const newConvo = !conversationId;
  const user = req.user.id;

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

  try {
    const { client } = await initializeClient({ req, res, endpointOption });

    const getAbortData = () => ({
      sender,
      userMessage,
      promptTokens,
      conversationId,
      userMessagePromise,
      // text: getPartialText(),
      messageId: responseMessageId,
      parentMessageId: overrideParentMessageId ?? userMessageId,
    });

    const { abortController, onStart } = createAbortController(req, res, getAbortData, getReqData);

    res.on('close', () => {
      logger.debug('[AgentController] Request closed');
      if (!abortController) {
        return;
      } else if (abortController.signal.aborted) {
        return;
      } else if (abortController.requestCompleted) {
        return;
      }

      abortController.abort();
      logger.debug('[AgentController] Request aborted on close');
    });

    const messageOptions = {
      user,
      onStart,
      getReqData,
      conversationId,
      parentMessageId,
      abortController,
      overrideParentMessageId,
      progressOptions: {
        res,
        // parentMessageId: overrideParentMessageId || userMessageId,
      },
    };

    let response = await client.sendMessage(text, messageOptions);

    if (overrideParentMessageId) {
      response.parentMessageId = overrideParentMessageId;
    }

    response.endpoint = endpointOption.endpoint;

    const { conversation = {} } = await client.responsePromise;
    conversation.title =
      conversation && !conversation.title ? null : conversation?.title || 'New Chat';

    if (client.options.attachments) {
      userMessage.files = client.options.attachments;
      conversation.model = endpointOption.modelOptions.model;
      delete userMessage.image_urls;
    }

    if (!abortController.signal.aborted) {
      sendMessage(res, {
        final: true,
        conversation,
        title: conversation.title,
        requestMessage: userMessage,
        responseMessage: response,
      });
      res.end();

      await saveMessage(
        req,
        { ...response, user },
        { context: 'api/server/controllers/agents/request.js - response end' },
      );
    }

    if (!client.skipSaveUserMessage) {
      await saveMessage(req, userMessage, {
        context: 'api/server/controllers/agents/request.js - don\'t skip saving user message',
      });
    }

    if (addTitle && parentMessageId === Constants.NO_PARENT && newConvo) {
      addTitle(req, {
        text,
        response,
        client,
      });
    }
  } catch (error) {
    handleAbortError(res, req, error, {
      conversationId,
      sender,
      messageId: responseMessageId,
      parentMessageId: userMessageId ?? parentMessageId,
    });
  }
};

module.exports = AgentController;
