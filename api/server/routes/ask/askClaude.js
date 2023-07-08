const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { titleConvo, ClaudeClient } = require('../../../app');
const requireJwtAuth = require('../../../middleware/requireJwtAuth');
const { saveMessage, getConvoTitle, saveConvo, getConvo } = require('../../../models');
const { handleError, sendMessage, createOnProgress } = require('./handlers');

router.post('/', requireJwtAuth, async (req, res) => {
  console.log('askClaude.js: req.body:', req.body)
  const { endpoint, text, parentMessageId, conversationId: oldConversationId } = req.body;
  if (text.length === 0) return handleError(res, { text: 'Prompt empty or too short' });
  if (endpoint !== 'claude') return handleError(res, { text: 'Illegal request' });

  const endpointOption = {};

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
      userMessageId = data.userMessage.messageId;
      responseMessageId = data.responseMessageId;
      if (!conversationId) {
        conversationId = data.conversationId;
      }

      sendMessage(res, { message: userMessage, created: true })
    };

    const { onProgress: progressCallback } = createOnProgress({
      onProgress: ({ text: partialText }) => {
        const currentTimestamp = Date.now();
        if (currentTimestamp - lastSavedTimestamp > 500) {
          lastSavedTimestamp = currentTimestamp;
          saveMessage({
            messageId: responseMessageId,
            sender: 'Claude',
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

    const client = new ClaudeClient();

    let response = await client.sendMessage(text, {
      getIds,
      user: req.user.id,
      conversationId,
      parentMessageId,
      overrideParentMessageId,
      onProgress: progressCallback.call(null, {
        res,
        text,
        parentMessageId: overrideParentMessageId || userMessageId
      }),
      abortController
    });

    if (overrideParentMessageId) {
      response.parentMessageId = overrideParentMessageId;
    }

    await saveConvo(req.user.id, {
      ...endpointOption,
      ...endpointOption.modelOptions,
      conversationId,
      endpoint: 'claude'
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
      sender: 'Claude',
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
