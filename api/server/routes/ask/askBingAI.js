const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { titleConvoBing, askBing } = require('../../../app');
const { saveMessage, getConvoTitle, saveConvo, getConvo } = require('../../../models');
const { handleError, sendMessage, createOnProgress, handleText } = require('./handlers');
const requireJwtAuth = require('../../../middleware/requireJwtAuth');

router.post('/', requireJwtAuth, async (req, res) => {
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
      jailbreak: req.body?.jailbreak ?? false,
      jailbreakConversationId: req.body?.jailbreakConversationId ?? null,
      systemMessage: req.body?.systemMessage ?? null,
      context: req.body?.context ?? null,
      toneStyle: req.body?.toneStyle ?? 'creative',
      token: req.body?.token ?? null
    };
  else
    endpointOption = {
      jailbreak: req.body?.jailbreak ?? false,
      systemMessage: req.body?.systemMessage ?? null,
      context: req.body?.context ?? null,
      conversationSignature: req.body?.conversationSignature ?? null,
      clientId: req.body?.clientId ?? null,
      invocationId: req.body?.invocationId ?? null,
      toneStyle: req.body?.toneStyle ?? 'creative',
      token: req.body?.token ?? null
    };

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
    const { onProgress: progressCallback } = createOnProgress({
      onProgress: ({ text }) => {
        const currentTimestamp = Date.now();
        if (currentTimestamp - lastSavedTimestamp > 500) {
          lastSavedTimestamp = currentTimestamp;
          saveMessage({
            messageId: responseMessageId,
            sender: endpointOption?.jailbreak ? 'Sydney' : 'BingAI',
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
    const abortController = new AbortController();
    let bingConversationId = null;
    if (!isNewConversation) {
      const convo = await getConvo(req.user.id, conversationId);
      bingConversationId = convo.bingConversationId;
    }
    let response = await askBing({
      text,
      parentMessageId: userParentMessageId,
      conversationId: bingConversationId ?? conversationId,
      ...endpointOption,
      onProgress: progressCallback.call(null, {
        res,
        text,
        parentMessageId: overrideParentMessageId || userMessageId
      }),
      abortController
    });

    console.log('BING RESPONSE', response);

    const newConversationId = endpointOption?.jailbreak
      ? response.jailbreakConversationId
      : response.conversationId || conversationId;
    const newUserMessageId =
      response.parentMessageId || response.details.requestId || userMessageId;
    const newResponseMessageId = response.messageId || response.details.messageId;

    // STEP1 generate response message
    response.text =
      response.response || response.details.spokenText || '**Bing refused to answer.**';

    let responseMessage = {
      conversationId,
      bingConversationId: newConversationId,
      messageId: responseMessageId,
      newMessageId: newResponseMessageId,
      parentMessageId: overrideParentMessageId || newUserMessageId,
      sender: endpointOption?.jailbreak ? 'Sydney' : 'BingAI',
      text: await handleText(response, true),
      suggestions:
        response.details.suggestedResponses &&
        response.details.suggestedResponses.map((s) => s.text),
      unfinished: false,
      cancelled: false,
      error: false
    };

    await saveMessage(responseMessage);
    responseMessage.messageId = newResponseMessageId;

    let conversationUpdate = { conversationId, bingConversationId: newConversationId, endpoint: 'bingAI' };

    if (endpointOption?.jailbreak) {
      conversationUpdate.jailbreak = true;
      conversationUpdate.jailbreakConversationId = response.jailbreakConversationId;
    } else {
      conversationUpdate.jailbreak = false;
      conversationUpdate.conversationSignature = response.conversationSignature;
      conversationUpdate.clientId = response.clientId;
      conversationUpdate.invocationId = response.invocationId;
    }

    await saveConvo(req.user.id, conversationUpdate);
    userMessage.messageId = newUserMessageId;

    // If response has parentMessageId, the fake userMessage.messageId should be updated to the real one.
    if (!overrideParentMessageId)
      await saveMessage({
        ...userMessage,
        messageId: userMessageId,
        newMessageId: newUserMessageId
      });
    userMessageId = newUserMessageId;

    sendMessage(res, {
      title: await getConvoTitle(req.user.id, conversationId),
      final: true,
      conversation: await getConvo(req.user.id, conversationId),
      requestMessage: userMessage,
      responseMessage: responseMessage
    });
    res.end();

    if (userParentMessageId == '00000000-0000-0000-0000-000000000000') {
      const title = await titleConvoBing({
        text,
        response: responseMessage
      });

      await saveConvo(req.user.id, {
        conversationId: conversationId,
        title
      });
    }
  } catch (error) {
    console.log(error);
    const errorMessage = {
      messageId: responseMessageId,
      sender: endpointOption?.jailbreak ? 'Sydney' : 'BingAI',
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
