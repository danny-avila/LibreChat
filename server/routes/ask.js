const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { ask, titleConvo } = require('../../app/chatgpt');
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
    const progressCallback = async (partial) => {
      if (i === 0) {
        userMessage.parentMessageId = parentMessageId ? parentMessageId : partial.id;
        userMessage.conversationId = conversationId ? conversationId : partial.conversationId;
        await saveMessage(userMessage);
        res.write(
          `event: message\ndata: ${JSON.stringify({ ...partial, initial: true })}\n\n`
        );
        i++;
      }
      const data = JSON.stringify({ ...partial, message: true });
      res.write(`event: message\ndata: ${data}\n\n`);
    };

    let gptResponse = await ask(text, progressCallback, { parentMessageId, conversationId });
    if (!!parentMessageId) {
      gptResponse = { ...gptResponse, parentMessageId };
    } else {
      gptResponse.title = await titleConvo(text, gptResponse.text);
    }

    if (
      (gptResponse.text.includes('2023') && !gptResponse.text.trim().includes(' ')) ||
      gptResponse.text.toLowerCase().includes('no response') ||
      gptResponse.text.toLowerCase().includes('no answer')
    ) {
      res.status(500).write('event: error\ndata: Prompt empty or too short');
      res.end();
      return;
    }

    gptResponse.sender = 'GPT';
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
