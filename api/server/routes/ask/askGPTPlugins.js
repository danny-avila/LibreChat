const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { browserClient } = require('../../../app/');
const { saveMessage, getConvoTitle, saveConvo, getConvo } = require('../../../models');
const { handleError, sendMessage, createOnProgress, handleText } = require('./handlers');

router.post('/', async (req, res) => {
  const {
    endpoint,
    text,
    parentMessageId,
    conversationId
  } = req.body;
  if (text.length === 0) return handleError(res, { text: 'Prompt empty or too short' });
  if (endpoint !== 'GPTPlugins') return handleError(res, { text: 'Illegal request' });

  // build user message --> handled by client

  // build endpoint option
  // const endpointOption = {
  //   model: req.body?.model ?? 'text-davinci-002-render-sha',
  //   token: req.body?.token ?? null
  // };

  console.log('ask log', {
    text,
    conversationId,
    // endpointOption,
  });

  // eslint-disable-next-line no-use-before-define
  return await ask({
    text,
    conversationId,
    parentMessageId,
    req,
    res
  });
});

const ask = async ({
  text,
  parentMessageId,
  // endpointOption,
  conversationId,
  req,
  res
}) => {
  // let { text, parentMessageId: userParentMessageId, messageId: userMessageId } = userMessage;

  res.writeHead(200, {
    Connection: 'keep-alive',
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Access-Control-Allow-Origin': '*',
    'X-Accel-Buffering': 'no'
  });

  // if (preSendRequest) sendMessage(res, { message: userMessage, created: true });

  let responseMessageId = crypto.randomUUID();

  try {
    let lastSavedTimestamp = 0;
    const { onProgress: progressCallback, getPartialText } = createOnProgress({
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
    let response = await browserClient({
      text,
      parentMessageId: userParentMessageId,
      conversationId,
      ...endpointOption,
      onProgress: progressCallback.call(null, { res, text }),
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

    // First update conversationId if needed
    let conversationUpdate = { conversationId: newConversationId, endpoint: 'chatGPTBrowser' };
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
    res.end();

    if (userParentMessageId == '00000000-0000-0000-0000-000000000000') {
      // const title = await titleConvo({ endpoint: endpointOption?.endpoint, text, response: responseMessage });
      const title = await response.details.title;
      await saveConvo(req?.session?.user?.username, {
        conversationId: conversationId,
        title
      });
    }
  } catch (error) {
    const errorMessage = {
      messageId: responseMessageId,
      sender: 'ChatGPT',
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
