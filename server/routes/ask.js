const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { ask, titleConvo } = require('../../app/chatgpt');
const { askClient } = require('../../app/chatgpt-client');
const { saveMessage, deleteMessages } = require('../../models/Message');
const { saveConvo } = require('../../models/Conversation');

const handleError = (res, errorMessage) => {
  res.status(500).write(`event: error\ndata: ${errorMessage}`);
  res.end();
};

const sendMessage = (res, message) => {
  res.write(`event: message\ndata: ${JSON.stringify(message)}\n\n`);
};

router.post('/', async (req, res) => {
  const { model, text, parentMessageId, conversationId } = req.body;
  if (!text.trim().includes(' ') && text.length < 5) {
    return handleError(res, 'Prompt empty or too short');
  }

  const userMessageId = crypto.randomUUID();
  let userMessage = { id: userMessageId, sender: 'User', text };

  console.log('ask log', { model, ...userMessage, parentMessageId, conversationId });

  res.writeHead(200, {
    Connection: 'keep-alive',
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Access-Control-Allow-Origin': '*',
    'X-Accel-Buffering': 'no'
  });

  try {
    let i = 0;
    let tokens = '';
    const progressCallback = async (partial) => {
      if (i === 0 && typeof partial === 'object') {
        userMessage.parentMessageId = parentMessageId ? parentMessageId : partial.id;
        userMessage.conversationId = conversationId ? conversationId : partial.conversationId;
        await saveMessage(userMessage);
        sendMessage(res, { ...partial, initial: true });
        i++;
      }

      if (typeof partial === 'object') {
        sendMessage(res, { ...partial, message: true });
      } else {
        tokens += partial;
        sendMessage(res, { text: tokens, message: true });
      }
    };

    let gptResponse = await askClient({
      model,
      text,
      progressCallback,
      convo: {
        parentMessageId,
        conversationId
      }
    });

    console.log('CLIENT RESPONSE', gptResponse);

    if (!parentMessageId) {
      gptResponse.title = await titleConvo(text, gptResponse.text);
    }

    if (!gptResponse.parentMessageId) {
      gptResponse.text = gptResponse.response;
      gptResponse.id = gptResponse.messageId;
      gptResponse.parentMessageId = gptResponse.messageId;
      userMessage.parentMessageId = parentMessageId ? parentMessageId : gptResponse.messageId;
      userMessage.conversationId = conversationId
        ? conversationId
        : gptResponse.conversationId;
      await saveMessage(userMessage);
      delete gptResponse.response;
    }

    if (
      (gptResponse.text.includes('2023') && !gptResponse.text.trim().includes(' ')) ||
      gptResponse.text.toLowerCase().includes('no response') ||
      gptResponse.text.toLowerCase().includes('no answer')
    ) {
      return handleError(res, 'Prompt empty or too short');
    }

    gptResponse.sender = 'GPT';
    gptResponse.final = true;
    await saveMessage(gptResponse);
    await saveConvo(gptResponse);
    sendMessage(res, gptResponse);
    res.end();
  } catch (error) {
    console.log(error);
    await deleteMessages({ id: userMessageId });
    handleError(res, error.message);
  }
});

module.exports = router;
