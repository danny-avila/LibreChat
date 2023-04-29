const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const ChatAgent = require('../../../app/langchain/agent');
const { getOpenAIModels } = require('../endpoints');
const { saveMessage, getConvoTitle, saveConvo, getConvo } = require('../../../models');
const { handleError, sendMessage, createOnProgress } = require('./handlers');

router.post('/', async (req, res) => {
  const { endpoint, text, parentMessageId, conversationId } = req.body;
  if (text.length === 0) return handleError(res, { text: 'Prompt empty or too short' });
  if (endpoint !== 'gptPlugins') return handleError(res, { text: 'Illegal request' });

  // build user message --> handled by client

  // build endpoint option
  const endpointOption = {
    model: req.body?.model ?? 'gpt-3.5-turbo',
    token: req.body?.token ?? null
  };
  const availableModels = getOpenAIModels();
  if (availableModels.find((model) => model === endpointOption.model) === undefined) {
    return handleError(res, { text: 'Illegal request: model' });
  }

  console.log('ask log', {
    text,
    conversationId,
    endpointOption
  });

  // eslint-disable-next-line no-use-before-define
  // return await ask({
  //   text,
  //   endpointOption,
  //   conversationId,
  //   parentMessageId,
  //   req,
  //   res
  // });
});

const ask = async ({ text, endpointOption, parentMessageId = null, conversationId, req, res }) => {
  // let { text, parentMessageId: userParentMessageId, messageId: userMessageId } = userMessage;

  res.writeHead(200, {
    Connection: 'keep-alive',
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Access-Control-Allow-Origin': '*',
    'X-Accel-Buffering': 'no'
  });
  let userMessage;
  let userMessageId;
  let responseMessageId;
  let lastSavedTimestamp = 0;

  try {
    const getIds = (data) => {
      userMessage = data.userMessage;
      userMessageId = userMessage.messageId;
      responseMessageId = data.responseMessageId;
      if (!conversationId) {
        conversationId = data.conversationId;
      }
    };

    const { onProgress: progressCallback, getPartialText } = createOnProgress({
      onProgress: ({ text: partialText }) => {
        const currentTimestamp = Date.now();
        if (currentTimestamp - lastSavedTimestamp > 500) {
          lastSavedTimestamp = currentTimestamp;
          saveMessage({
            messageId: responseMessageId,
            sender: 'ChatGPT',
            conversationId,
            parentMessageId: userMessageId,
            text: partialText,
            unfinished: true,
            cancelled: false,
            error: false
          });
        }
      }
    });

    const abortController = new AbortController();

    const chatAgent = new ChatAgent(process.env.OPENAI_KEY, {
      tools: endpointOption?.tools || ['calculator', 'google', 'browser'],
      modelOptions: {
        model: 'gpt-4'
      }
    });

    let response = await chatAgent.sendMessage(text, {
      getIds,
      user: req?.session?.user?.username,
      parentMessageId,
      conversationId,
      onProgress: progressCallback.call(null, { res, text }),
      abortController,
      ...endpointOption
    });

    console.log('CLIENT RESPONSE', response);

    // STEP1 generate response message
    response.text = response.response || '**ChatGPT refused to answer.**';
    sendMessage(res, {
      title: await getConvoTitle(req?.session?.user?.username, conversationId),
      final: true,
      conversation: await getConvo(req?.session?.user?.username, conversationId),
      requestMessage: userMessage,
      responseMessage: response
    });
    res.end();

    if (parentMessageId == '00000000-0000-0000-0000-000000000000') {
      // const title = await titleConvo({ endpoint: endpointOption?.endpoint, text, response: responseMessage });
      const title = await response.details.title;
      await saveConvo(req?.session?.user?.username, {
        conversationId,
        title
      });
    }
  } catch (error) {
    const errorMessage = {
      messageId: responseMessageId,
      sender: 'ChatGPT',
      conversationId,
      parentMessageId,
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
