const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { ask, titleConvo } = require('../../app/chatgpt');
const { askClient } = require('../../app/chatgpt-client');
const { saveMessage, deleteMessages } = require('../../models/Message');
const { saveConvo } = require('../../models/Conversation');

router.post('/', async (req, res) => {
  const { text, parentMessageId, conversationId } = req.body;
  if (!text.trim().includes(' ') && text.length < 5) {
    res.status(500).write('Prompt empty or too short');
    res.end();
    return;
  }

  const userMessageId = crypto.randomUUID();
  let userMessage = { id: userMessageId, sender: 'User', text };

  console.log('ask log', userMessage);

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
        res.write(
          `event: message\ndata: ${JSON.stringify({ ...partial, initial: true })}\n\n`
        );
        i++;
      }

      if (typeof partial === 'object') {
        const data = JSON.stringify({ ...partial, message: true });
        res.write(`event: message\ndata: ${data}\n\n`);
      } else {
        tokens += partial;
        res.write(`event: message\ndata: ${JSON.stringify({ text: tokens, message: true })}\n\n`);
      }
    };

    let gptResponse = await askClient(text, progressCallback, { parentMessageId, conversationId });

    console.log('CLIENT RESPONSE', gptResponse);

    if (!!parentMessageId) {
      gptResponse = { ...gptResponse, parentMessageId };
    } else {
      gptResponse.title = await titleConvo(text, gptResponse.text);
    }

    if (!gptResponse.parentMessageId && !parentMessageId) {
      userMessage.parentMessageId = gptResponse.messageId;
      gptResponse.parentMessageId = gptResponse.messageId;
      userMessage.conversationId = gptResponse.conversationId;
    }

    const response = gptResponse.text || gptResponse.response;

    if (gptResponse.response) {
      await saveMessage(userMessage);
      gptResponse.text = gptResponse.response;
      gptResponse.id = gptResponse.messageId;
      delete gptResponse.response;
    }

    if (
      (response.includes('2023') && !response.trim().includes(' ')) ||
      response.toLowerCase().includes('no response') ||
      response.toLowerCase().includes('no answer')
    ) {
      res.status(500).write('event: error\ndata: Prompt empty or too short');
      res.end();
      return;
    }

    gptResponse.sender = 'GPT';

    console.log('gptResponse', gptResponse);

    await saveMessage(gptResponse);
    await saveConvo(gptResponse);

    res.write(`event: message\ndata: ${JSON.stringify(gptResponse)}\n\n`);
    res.end();
  } catch (error) {
    console.log(error);
    await deleteMessages({ id: userMessageId });
    res.status(500).write('event: error\ndata: ' + error.message);
    res.end();
  }
});

module.exports = router;
