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
  if (endpoint !== 'gptPlugins') return handleError(res, { text: 'Illegal request' });

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
  // endpointOption,
  text,
  parentMessageId = null,
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
            sender: 'ChatGPT',
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
      parentMessageId,
      conversationId,
      ...endpointOption,
      onProgress: progressCallback.call(null, { res, text }),
      abortController
    });

    console.log('CLIENT RESPONSE', response);


    // STEP1 generate response message
    response.text = response.response || '**ChatGPT refused to answer.**';
    sendMessage(res, {
      title: await getConvoTitle(req?.session?.user?.username, conversationId),
      final: true,
      conversation: await getConvo(req?.session?.user?.username, conversationId),
      requestMessage: userMessage,
      responseMessage: responseMessage
    });
    res.end();

    // if (parentMessageId == '00000000-0000-0000-0000-000000000000') {
    if (!parentMessageId) {
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
      parentMessageId: ,
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
