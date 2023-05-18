const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const addToCache = require('./addToCache');
const { getOpenAIModels } = require('../endpoints');
const { titleConvo, askClient } = require('../../../app/');
const { saveMessage, getConvoTitle, saveConvo, getConvo } = require('../../../models');
const { handleError, sendMessage, createOnProgress, handleText } = require('./handlers');
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
  const {
    endpoint,
    text,
    overrideParentMessageId = null,
    parentMessageId,
    conversationId: oldConversationId
  } = req.body;
  if (text.length === 0) return handleError(res, { text: 'Prompt empty or too short' });
  if (endpoint !== 'openAI') return handleError(res, { text: 'Illegal request' });

  // build user message
  const conversationId = oldConversationId || crypto.randomUUID();
  const isNewConversation = !oldConversationId;
  const userMessageId = crypto.randomUUID();
  const userParentMessageId = parentMessageId || '00000000-0000-0000-0000-000000000000';
  const userMessage = {
    messageId: userMessageId,
    sender: 'User',
    text,
    parentMessageId: userParentMessageId,
    conversationId,
    isCreatedByUser: true
  };

  // build endpoint option
  const endpointOption = {
    model: req.body?.model ?? 'gpt-3.5-turbo',
    chatGptLabel: req.body?.chatGptLabel ?? null,
    promptPrefix: req.body?.promptPrefix ?? null,
    temperature: req.body?.temperature ?? 1,
    top_p: req.body?.top_p ?? 1,
    presence_penalty: req.body?.presence_penalty ?? 0,
    frequency_penalty: req.body?.frequency_penalty ?? 0
  };

  const availableModels = getOpenAIModels();
  if (availableModels.find(model => model === endpointOption.model) === undefined)
    return handleError(res, { text: 'Illegal request: model' });

  console.log('ask log', {
    userMessage,
    endpointOption,
    conversationId
  });

  if (!overrideParentMessageId) {
    await saveMessage(userMessage);
    await saveConvo(req.user.id, {
      ...userMessage,
      ...endpointOption,
      conversationId,
      endpoint
    });
  }

  // eslint-disable-next-line no-use-before-define
  return await ask({
    isNewConversation,
    userMessage,
    endpointOption,
    conversationId,
    preSendRequest: true,
    overrideParentMessageId,
    req,
    res
  });
});

const ask = async ({
  isNewConversation,
  userMessage,
  endpointOption,
  conversationId,
  preSendRequest = true,
  overrideParentMessageId = null,
  req,
  res
}) => {
  let { text, parentMessageId: userParentMessageId, messageId: userMessageId } = userMessage;
  const userId = req.user.id;
  let responseMessageId = crypto.randomUUID();

  res.writeHead(200, {
    Connection: 'keep-alive',
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Access-Control-Allow-Origin': '*',
    'X-Accel-Buffering': 'no'
  });

  if (preSendRequest) sendMessage(res, { message: userMessage, created: true });

  try {
    let lastSavedTimestamp = 0;
    const { onProgress: progressCallback, getPartialText } = createOnProgress({
      onProgress: ({ text }) => {
        const currentTimestamp = Date.now();
        if (currentTimestamp - lastSavedTimestamp > 500) {
          lastSavedTimestamp = currentTimestamp;
          saveMessage({
            messageId: responseMessageId,
            sender: endpointOption?.chatGptLabel || 'ChatGPT',
            conversationId,
            parentMessageId: overrideParentMessageId || userMessageId,
            text: text,
            unfinished: true,
            cancelled: false,
            error: false
          });
        }
      }
    });

    let abortController = new AbortController();
    abortController.abortAsk = async function () {
      this.abort();

      const responseMessage = {
        messageId: responseMessageId,
        sender: endpointOption?.chatGptLabel || 'ChatGPT',
        conversationId,
        parentMessageId: overrideParentMessageId || userMessageId,
        text: getPartialText(),
        unfinished: false,
        cancelled: true,
        error: false
      };

      saveMessage(responseMessage);
      await addToCache({ endpoint: 'openAI', endpointOption, userMessage, responseMessage });

      return {
        title: await getConvoTitle(req.user.id, conversationId),
        final: true,
        conversation: await getConvo(req.user.id, conversationId),
        requestMessage: userMessage,
        responseMessage: responseMessage
      };
    };
    const abortKey = conversationId;
    abortControllers.set(abortKey, { abortController, ...endpointOption });
    const oaiApiKey = req.body?.token ?? null;

    let response = await askClient({
      text,
      parentMessageId: userParentMessageId,
      conversationId,
      oaiApiKey,
      ...endpointOption,
      onProgress: progressCallback.call(null, {
        res,
        text,
        parentMessageId: overrideParentMessageId || userMessageId
      }),
      abortController,
      userId
    });

    abortControllers.delete(abortKey);
    console.log('CLIENT RESPONSE', response);

    const newConversationId = response.conversationId || conversationId;
    const newUserMassageId = response.parentMessageId || userMessageId;
    const newResponseMessageId = response.messageId;

    // STEP1 generate response message
    response.text = response.response || '**ChatGPT refused to answer.**';

    let responseMessage = {
      conversationId: newConversationId,
      messageId: responseMessageId,
      newMessageId: newResponseMessageId,
      parentMessageId: overrideParentMessageId || newUserMassageId,
      text: await handleText(response),
      sender: endpointOption?.chatGptLabel || 'ChatGPT',
      unfinished: false,
      cancelled: false,
      error: false
    };

    await saveMessage(responseMessage);
    responseMessage.messageId = newResponseMessageId;

    // STEP2 update the conversation
    let conversationUpdate = { conversationId: newConversationId, endpoint: 'openAI' };
    if (conversationId != newConversationId)
      if (isNewConversation) {
        // change the conversationId to new one
        conversationUpdate = {
          ...conversationUpdate,
          conversationId: conversationId,
          newConversationId: newConversationId
        };
      } else {
        // create new conversation
        conversationUpdate = {
          ...conversationUpdate,
          ...endpointOption
        };
      }

    await saveConvo(req.user.id, conversationUpdate);
    conversationId = newConversationId;

    // STEP3 update the user message
    userMessage.conversationId = newConversationId;
    userMessage.messageId = newUserMassageId;

    // If response has parentMessageId, the fake userMessage.messageId should be updated to the real one.
    if (!overrideParentMessageId)
      await saveMessage({ ...userMessage, messageId: userMessageId, newMessageId: newUserMassageId });
    userMessageId = newUserMassageId;

    sendMessage(res, {
      title: await getConvoTitle(req.user.id, conversationId),
      final: true,
      conversation: await getConvo(req.user.id, conversationId),
      requestMessage: userMessage,
      responseMessage: responseMessage
    });
    res.end();

    if (userParentMessageId == '00000000-0000-0000-0000-000000000000') {
      const title = await titleConvo({ endpoint: endpointOption?.endpoint, text, response: responseMessage, oaiApiKey });
      await saveConvo(req.user.id, {
        conversationId: conversationId,
        title
      });
    }
  } catch (error) {
    console.error(error);
    const errorMessage = {
      messageId: responseMessageId,
      sender: endpointOption?.chatGptLabel || 'ChatGPT',
      conversationId,
      parentMessageId: overrideParentMessageId || userMessageId,
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
