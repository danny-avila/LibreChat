const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const addToCache = require('./addToCache');
const { getOpenAIModels } = require('../endpoints');
const { titleConvo, askClient } = require('../../../app/');
const { saveMessage, getConvoTitle, saveConvo, updateConvo, getConvo } = require('../../../models');
const { handleError, sendMessage, createOnProgress, handleText } = require('./handlers');

const abortControllers = new Map();

router.post('/abort', async (req, res) => {
  const { abortKey, latestMessage } = req.body;
  console.log(`req.body`, req.body);
  if (!abortControllers.has(abortKey)) {
    return res.status(404).send('Request not found');
  }
  
  const { abortController, userMessage, endpointOption } = abortControllers.get(abortKey);
  if (!endpointOption.endpoint) {
    endpointOption.endpoint = req.originalUrl.replace('/api/ask/','').split('/abort')[0];
  }

  abortController.abort();
  abortControllers.delete(abortKey);
  console.log('Aborted request', abortKey, userMessage, endpointOption);
  await addToCache({ endpointOption, userMessage, latestMessage });
  
  res.status(200).send('Aborted');
});

router.post('/', async (req, res) => {
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
    await saveConvo(req?.session?.user?.username, {
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

  res.writeHead(200, {
    Connection: 'keep-alive',
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Access-Control-Allow-Origin': '*',
    'X-Accel-Buffering': 'no'
  });

  if (preSendRequest) sendMessage(res, { message: userMessage, created: true });

  try {
    const progressCallback = createOnProgress();
    const abortController = new AbortController();
    const abortKey = conversationId;
    console.log('conversationId -----> ', conversationId);
    abortControllers.set(abortKey, { abortController, userMessage, endpointOption });
    
    res.on('close', () => {
      abortController.abort();
      return res.end();
    });
    let response = await askClient({
      text,
      parentMessageId: userParentMessageId,
      conversationId,
      ...endpointOption,
      onProgress: progressCallback.call(null, {
        res,
        text,
        parentMessageId: overrideParentMessageId || userMessageId
      }),
      abortController
    });

    console.log('CLIENT RESPONSE', response);

    const newConversationId = response.conversationId || conversationId;
    const newUserMassageId = response.parentMessageId || userMessageId;
    const newResponseMessageId = response.messageId;

    // STEP1 generate response message
    response.text = response.response || '**ChatGPT refused to answer.**';

    let responseMessage = {
      conversationId: newConversationId,
      messageId: newResponseMessageId,
      parentMessageId: overrideParentMessageId || newUserMassageId,
      text: await handleText(response),
      sender: endpointOption?.chatGptLabel || 'ChatGPT'
    };

    await saveMessage(responseMessage);

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

    await saveConvo(req?.session?.user?.username, conversationUpdate);
    conversationId = newConversationId;

    // STEP3 update the user message
    userMessage.conversationId = newConversationId;
    userMessage.messageId = newUserMassageId;

    // If response has parentMessageId, the fake userMessage.messageId should be updated to the real one.
    if (!overrideParentMessageId)
      await saveMessage({ ...userMessage, messageId: userMessageId, newMessageId: newUserMassageId });
    userMessageId = newUserMassageId;

    sendMessage(res, {
      title: await getConvoTitle(req?.session?.user?.username, conversationId),
      final: true,
      conversation: await getConvo(req?.session?.user?.username, conversationId),
      requestMessage: userMessage,
      responseMessage: responseMessage
    });
    abortControllers.delete(abortKey);
    res.end();

    if (userParentMessageId == '00000000-0000-0000-0000-000000000000') {
      const title = await titleConvo({ endpoint: endpointOption?.endpoint, text, response: responseMessage });
      await updateConvo(req?.session?.user?.username, {
        conversationId: conversationId,
        title
      });
    }
  } catch (error) {
    console.error(error);
    const errorMessage = {
      messageId: crypto.randomUUID(),
      sender: endpointOption?.chatGptLabel || 'ChatGPT',
      conversationId,
      parentMessageId: overrideParentMessageId || userMessageId,
      error: true,
      text: error.message
    };
    await saveMessage(errorMessage);
    handleError(res, errorMessage);
  }
};

module.exports = router;
