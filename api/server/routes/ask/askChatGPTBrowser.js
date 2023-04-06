const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { getChatGPTBrowserModels } = require('../endpoints');
const { browserClient } = require('../../../app/');
const { saveMessage, getConvoTitle, saveConvo, updateConvo, getConvo } = require('../../../models');
const { handleError, sendMessage, createOnProgress, handleText } = require('./handlers');

router.post('/', async (req, res) => {
  const {
    endpoint,
    text,
    overrideParentMessageId = null,
    parentMessageId,
    conversationId: oldConversationId
  } = req.body;
  if (text.length === 0) return handleError(res, { text: 'Prompt empty or too short' });
  if (endpoint !== 'chatGPTBrowser') return handleError(res, { text: 'Illegal request' });

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
    model: req.body?.model || 'text-davinci-002-render-sha'
  };

  const availableModels = getChatGPTBrowserModels();
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
    res.on('close', () => abortController.abort());
    let response = await browserClient({
      text,
      parentMessageId: userParentMessageId,
      conversationId,
      ...endpointOption,
      onProgress: progressCallback.call(null, { res, text }),
      abortController
    });

    console.log('CLIENT RESPONSE', response);

    // STEP1 generate response message
    response.text = response.response || '**ChatGPT refused to answer.**';

    let responseMessage = {
      conversationId: response.conversationId,
      messageId: response.messageId,
      parentMessageId: overrideParentMessageId || response.parentMessageId || userMessageId,
      text: await handleText(response),
      sender: endpointOption?.chatGptLabel || 'ChatGPT'
    };

    await saveMessage(responseMessage);

    // STEP2 update the conversation

    // First update conversationId if needed
    let conversationUpdate = { conversationId, endpoint: 'chatGPTBrowser' };
    if (conversationId != responseMessage.conversationId && isNewConversation)
      conversationUpdate = {
        ...conversationUpdate,
        conversationId: conversationId,
        newConversationId: responseMessage.conversationId || conversationId
      };
    conversationId = responseMessage.conversationId || conversationId;

    await saveConvo(req?.session?.user?.username, conversationUpdate);

    // STEP3 update the user message
    userMessage.conversationId = conversationId;
    userMessage.messageId = responseMessage.parentMessageId;

    // If response has parentMessageId, the fake userMessage.messageId should be updated to the real one.
    if (!overrideParentMessageId) {
      const oldUserMessageId = userMessageId;
      await saveMessage({ ...userMessage, messageId: oldUserMessageId, newMessageId: userMessage.messageId });
    }
    userMessageId = userMessage.messageId;

    sendMessage(res, {
      title: await getConvoTitle(req?.session?.user?.username, conversationId),
      final: true,
      conversation: await getConvo(req?.session?.user?.username, conversationId),
      requestMessage: userMessage,
      responseMessage: responseMessage
    });
    res.end();

    if (userParentMessageId == '00000000-0000-0000-0000-000000000000') {
      // const title = await titleConvo({ endpoint: endpointOption?.endpoint, text, response: responseMessage });
      const title = await response.details.title;
      await updateConvo(req?.session?.user?.username, {
        conversationId: conversationId,
        title
      });
    }
  } catch (error) {
    const errorMessage = {
      messageId: crypto.randomUUID(),
      sender: 'ChatGPT',
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
