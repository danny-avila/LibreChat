const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { titleConvo, askBing } = require('../../../app');
const { saveMessage, getConvoTitle, saveConvo, getConvo } = require('../../../models');
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
  let endpointOption = {};
  if (req.body?.jailbreak)
    endpointOption = {
      jailbreak: req.body?.jailbreak || false,
      jailbreakConversationId: req.body?.jailbreakConversationId || null,
      systemMessage: req.body?.systemMessage || null,
      context: req.body?.context || null,
      toneStyle: req.body?.toneStyle || 'fast'
    };
  else
    endpointOption = {
      jailbreak: req.body?.jailbreak || false,
      systemMessage: req.body?.systemMessage || null,
      context: req.body?.context || null,
      conversationSignature: req.body?.conversationSignature || null,
      clientId: req.body?.clientId || null,
      invocationId: req.body?.invocationId || null,
      toneStyle: req.body?.toneStyle || 'fast'
    };

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

    // STEP1 generate response message
    response.text = response.response || response.details.spokenText || '**Bing refused to answer.**';

    let responseMessage = {
      text: await handleText(response, true),
      suggestions:
        response.details.suggestedResponses && response.details.suggestedResponses.map(s => s.text),
      jailbreak: endpointOption?.jailbreak
    };
    // // response.text = await handleText(response, true);
    // response.suggestions =
    //   response.details.suggestedResponses && response.details.suggestedResponses.map(s => s.text);

    if (endpointOption?.jailbreak) {
      responseMessage.conversationId = response.jailbreakConversationId;
      responseMessage.messageId = response.messageId || response.details.messageId;
      responseMessage.parentMessageId = overrideParentMessageId || response.parentMessageId || userMessageId;
      responseMessage.sender = 'Sydney';
    } else {
      responseMessage.conversationId = response.conversationId;
      responseMessage.messageId = response.messageId || response.details.messageId;
      response.parentMessageId =
        overrideParentMessageId || response.parentMessageId || response.details.requestId || userMessageId;
      responseMessage.sender = 'BingAI';
    }

    await saveMessage(responseMessage);

    // STEP2 update the convosation.

    // First update conversationId if needed
    // Note!
    // Bing API will not use our conversationId at the first time,
    // so change the placeholder conversationId to the real one.
    // Attition: the api will also create new conversationId while using invalid userMessage.parentMessageId,
    // but in this situation, don't change the conversationId, but create new convo.

    let conversationUpdate = { conversationId, endpoint: 'bingAI' };
    if (conversationId != responseMessage.conversationId && isNewConversation)
      conversationUpdate = {
        ...conversationUpdate,
        conversationId: conversationId,
        newConversationId: responseMessage.conversationId || conversationId
      };
    conversationId = responseMessage.conversationId || conversationId;

    if (endpointOption?.jailbreak) {
      conversationUpdate.jailbreak = true;
      conversationUpdate.jailbreakConversationId = response.jailbreakConversationId;
    } else {
      conversationUpdate.jailbreak = false;
      conversationUpdate.conversationSignature = response.conversationSignature;
      conversationUpdate.clientId = response.clientId;
      conversationUpdate.invocationId = response.invocationId;
    }

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
