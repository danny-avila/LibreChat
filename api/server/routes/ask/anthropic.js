const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { titleConvo, AnthropicClient } = require('../../../app');
const requireJwtAuth = require('../../../middleware/requireJwtAuth');
const { abortMessage } = require('../../../utils');
const { saveMessage, getConvoTitle, saveConvo, getConvo } = require('../../../models');
const { handleError, sendMessage, createOnProgress } = require('./handlers');

const abortControllers = new Map();

router.post('/abort', requireJwtAuth, async (req, res) => {
  return await abortMessage(req, res, abortControllers);
});

router.post('/', requireJwtAuth, async (req, res) => {
  const { endpoint, text, parentMessageId, conversationId: oldConversationId } = req.body;
  if (text.length === 0) return handleError(res, { text: 'Prompt empty or too short' });
  if (endpoint !== 'anthropic') return handleError(res, { text: 'Illegal request' });

  console.log('ask log', req.body);
  const endpointOption = {
    promptPrefix: req.body?.promptPrefix ?? null,
    modelLabel: req.body?.modelLabel ?? null,
    token: req.body?.token ?? null,
    modelOptions: {
      model: req.body?.model ?? 'claude-1',
      temperature: req.body?.temperature ?? 0.7,
      maxOutputTokens: req.body?.maxOutputTokens ?? 1024,
      topP: req.body?.topP ?? 0.7,
      topK: req.body?.topK ?? 40
    }
  };

  const conversationId = oldConversationId || crypto.randomUUID();

  return await ask({
    text,
    endpointOption,
    conversationId,
    parentMessageId,
    req,
    res
  });
});

const ask = async ({ text, endpointOption, parentMessageId = null, conversationId, req, res }) => {
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
  const { overrideParentMessageId = null } = req.body;

  try {
    const getIds = (data) => {
      userMessage = data.userMessage;
      userMessageId = data.userMessage.messageId;
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
            sender: 'Anthropic',
            conversationId,
            parentMessageId: overrideParentMessageId || userMessageId,
            text: partialText,
            unfinished: true,
            cancelled: false,
            error: false
          });
        }
      }
    });

    const abortController = new AbortController();
    abortController.abortAsk = async function () {
      this.abort();

      const responseMessage = {
        messageId: responseMessageId,
        sender: 'Anthropic',
        conversationId,
        parentMessageId: overrideParentMessageId || userMessageId,
        text: getPartialText(),
        model: endpointOption.modelOptions.model,
        unfinished: false,
        cancelled: true,
        error: false,
      };

      saveMessage(responseMessage);

      return {
        title: await getConvoTitle(req.user.id, conversationId),
        final: true,
        conversation: await getConvo(req.user.id, conversationId),
        requestMessage: userMessage,
        responseMessage: responseMessage
      };
    };

    const onStart = (userMessage) => {
      sendMessage(res, { message: userMessage, created: true });
      abortControllers.set(userMessage.conversationId, { abortController, ...endpointOption });
    }

    const client = new AnthropicClient();

    let response = await client.sendMessage(text, {
      getIds,
      debug: true,
      user: req.user.id,
      conversationId,
      parentMessageId,
      overrideParentMessageId,
      ...endpointOption,
      onProgress: progressCallback.call(null, {
        res,
        text,
        parentMessageId: overrideParentMessageId || userMessageId
      }),
      onStart,
      abortController
    });

    if (overrideParentMessageId) {
      response.parentMessageId = overrideParentMessageId;
    }

    await saveConvo(req.user.id, {
      ...endpointOption,
      ...endpointOption.modelOptions,
      conversationId,
      endpoint: 'anthropic'
    });

    await saveMessage(response);
    sendMessage(res, {
      title: await getConvoTitle(req.user.id, conversationId),
      final: true,
      conversation: await getConvo(req.user.id, conversationId),
      requestMessage: userMessage,
      responseMessage: response
    });
    res.end();

    if (parentMessageId == '00000000-0000-0000-0000-000000000000') {
      const title = await titleConvo({ text, response });
      await saveConvo(req.user.id, {
        conversationId,
        title
      });
    }
  } catch (error) {
    console.error(error);
    const errorMessage = {
      messageId: responseMessageId,
      sender: 'Anthropic',
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
