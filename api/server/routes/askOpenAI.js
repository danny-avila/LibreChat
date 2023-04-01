const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { titleConvo, askClient } = require('../../app/');
const { saveMessage, getConvoTitle, saveConvo, updateConvo, getConvo } = require('../../models');
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
  if (endpoint !== 'openAI') return handleError(res, { text: 'Illegal request' });

  // build user message
  const conversationId = oldConversationId || crypto.randomUUID();
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
    model: req.body?.model || 'gpt-3.5-turbo',
    chatGptLabel: req.body?.chatGptLabel || null,
    promptPrefix: req.body?.promptPrefix || null,
    temperature: req.body?.temperature || 1,
    top_p: req.body?.top_p || 1,
    presence_penalty: req.body?.presence_penalty || 0,
    frequency_penalty: req.body?.frequency_penalty || 0
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

  return await ask({
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
  userMessage,
  endpointOption,
  conversationId,
  preSendRequest = true,
  overrideParentMessageId = null,
  req,
  res
}) => {
  const { text, parentMessageId: userParentMessageId, messageId: userMessageId } = userMessage;

  const client = askClient;

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
    let gptResponse = await client({
      text,
      parentMessageId: userParentMessageId,
      conversationId,
      ...endpointOption,
      onProgress: progressCallback.call(null, { res, text }),
      abortController
    });

    gptResponse.text = gptResponse.response;
    console.log('CLIENT RESPONSE', gptResponse);

    if (!gptResponse.parentMessageId) {
      gptResponse.parentMessageId = overrideParentMessageId || userMessageId;
      delete gptResponse.response;
    }

    gptResponse.sender = endpointOption?.chatGptLabel || 'ChatGPT';
    // gptResponse.model = model;
    gptResponse.text = await handleText(gptResponse);
    // if (convo.chatGptLabel?.length > 0 && model === 'chatgptCustom') {
    //   gptResponse.chatGptLabel = convo.chatGptLabel;
    // }

    // if (convo.promptPrefix?.length > 0 && model === 'chatgptCustom') {
    //   gptResponse.promptPrefix = convo.promptPrefix;
    // }

    gptResponse.parentMessageId = overrideParentMessageId || userMessageId;

    await saveMessage(gptResponse);
    await updateConvo(req?.session?.user?.username, {
      ...gptResponse,
      oldConvoId: conversationId
    });

    sendMessage(res, {
      title: await getConvoTitle(req?.session?.user?.username, conversationId),
      final: true,
      conversation: await getConvo(req?.session?.user?.username, conversationId),
      requestMessage: userMessage,
      responseMessage: gptResponse
    });
    res.end();

    if (userParentMessageId == '00000000-0000-0000-0000-000000000000') {
      const title = await titleConvo({ endpoint: endpointOption?.endpoint, text, response: gptResponse });
      await updateConvo(req?.session?.user?.username, {
        conversationId: conversationId,
        title
      });
    }
  } catch (error) {
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
