const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { titleConvo, askBing } = require('../../app');
const { saveBingMessage, getConvoTitle, saveConvo, getConvo } = require('../../models');
const { handleError, sendMessage, createOnProgress, handleText } = require('./handlers');

router.post('/', async (req, res) => {
  const {
    endpoint,
    text,
    messageId,
    overrideParentMessageId = null,
    parentMessageId,
    conversationId: oldConversationId
  } = req.body;
  if (text.length === 0) return handleError(res, { text: 'Prompt empty or too short' });
  if (endpoint !== 'bingAI') return handleError(res, { text: 'Illegal request' });

  // build user message
  const conversationId = oldConversationId || crypto.randomUUID();
  const isNewConversation = !oldConversationId;
  const userMessageId = messageId;
  const userParentMessageId = parentMessageId || '00000000-0000-0000-0000-000000000000';
  let userMessage = {
    messageId: userMessageId,
    sender: 'User',
    text,
    parentMessageId: userParentMessageId,
    conversationId,
    isCreatedByUser: true
  };

  // build endpoint option
  const endpointOption = {
    jailbreak: req.body?.jailbreak || false,
    jailbreakConversationId: req.body?.jailbreakConversationId || null,
    conversationSignature: req.body?.conversationSignature || null,
    clientId: req.body?.clientId || null,
    invocationId: req.body?.invocationId || null,
    toneStyle: req.body?.toneStyle || 'fast',
    suggestions: req.body?.suggestions || []
  };

  console.log('ask log', {
    userMessage,
    endpointOption,
    conversationId
  });

  if (!overrideParentMessageId) {
    await saveBingMessage(userMessage);
    await saveConvo(req?.session?.user?.username, { ...userMessage, ...endpointOption, conversationId });
  }

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
    let response = await askBing({
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

    console.log('BING RESPONSE', response);

    userMessage.conversationSignature =
      endpointOption.conversationSignature || response.conversationSignature;
    userMessage.conversationId = response.conversationId || conversationId;
    userMessage.invocationId = endpointOption.invocationId;
    userMessage.messageId = response.details.requestId || userMessageId;
    if (!overrideParentMessageId) await saveBingMessage({ oldMessageId: userMessageId, ...userMessage });

    // Bing API will not use our conversationId at the first time,
    // so change the placeholder conversationId to the real one.
    // Attition: the api will also create new conversationId while using invalid userMessage.parentMessageId,
    // but in this situation, don't change the conversationId, but create new convo.
    if (conversationId != userMessage.conversationId && isNewConversation)
      await saveConvo(req?.session?.user?.username, {
        conversationId: conversationId,
        newConversationId: userMessage.conversationId
      });
    conversationId = userMessage.conversationId;

    response.text = response.response || response.details.spokenText || '**Bing refused to answer.**';
    // delete response.response;
    // response.id = response.details.messageId;
    response.suggestions =
      response.details.suggestedResponses && response.details.suggestedResponses.map(s => s.text);
    response.sender = endpointOption?.jailbreak ? 'Sydney' : 'BingAI';
    // response.final = true;

    response.messageId = response.details.messageId;
    // override the parentMessageId, for the regeneration.
    response.parentMessageId = overrideParentMessageId || response.details.requestId || userMessageId;

    response.text = await handleText(response, true);
    await saveBingMessage(response);
    await saveConvo(req?.session?.user?.username, {
      ...endpointOption,
      ...response
    });

    sendMessage(res, {
      title: await getConvoTitle(req?.session?.user?.username, conversationId),
      final: true,
      conversation: await getConvo(req?.session?.user?.username, conversationId),
      requestMessage: userMessage,
      responseMessage: response
    });
    res.end();

    if (userParentMessageId == '00000000-0000-0000-0000-000000000000') {
      const title = await titleConvo({ endpoint: endpointOption?.endpoint, text, response });

      await saveConvo(req?.session?.user?.username, {
        conversationId: conversationId,
        title
      });
    }
  } catch (error) {
    console.log(error);
    const errorMessage = {
      messageId: crypto.randomUUID(),
      sender: endpointOption?.jailbreak ? 'Sydney' : 'BingAI',
      conversationId,
      parentMessageId: overrideParentMessageId || userMessageId,
      error: true,
      text: error.message
    };
    await saveBingMessage(errorMessage);
    handleError(res, errorMessage);
  }
};

module.exports = router;
