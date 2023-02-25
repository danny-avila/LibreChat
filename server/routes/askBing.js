const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { titleConvo, askBing } = require('../../app/');
const { saveMessage, deleteMessages, saveConvo } = require('../../models');
const { handleError, sendMessage } = require('./handlers');

router.post('/', async (req, res) => {
  const { model, text, ...convo } = req.body;
  if (!text.trim().includes(' ') && text.length < 5) {
    return handleError(res, 'Prompt empty or too short');
  }

  const userMessageId = crypto.randomUUID();
  let userMessage = { id: userMessageId, sender: 'User', text };

  console.log('ask log', { model, ...userMessage, ...convo });

  res.writeHead(200, {
    Connection: 'keep-alive',
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Access-Control-Allow-Origin': '*',
    'X-Accel-Buffering': 'no'
  });

  try {
    let tokens = '';
    const progressCallback = async (partial) => {
      tokens += partial === text ? '' : partial;
      // tokens = appendCode(tokens);
      sendMessage(res, { text: tokens, message: true });
    };

    let response = await askBing({
      text,
      progressCallback,
      convo
    });

    console.log('CLIENT RESPONSE');
    console.dir(response, { depth: null });

    userMessage.conversationSignature =
      convo.conversationSignature || response.conversationSignature;
    userMessage.conversationId = convo.conversationId || response.conversationId;
    userMessage.invocationId = response.invocationId;
    await saveMessage(userMessage);

    if (!convo.conversationSignature) {
      response.title = await titleConvo(text, response.response, model);
    }

    response.text = response.response;
    response.id = response.details.messageId;
    response.suggestions =
      response.details.suggestedResponses &&
      response.details.suggestedResponses.map((s) => s.text);
    response.sender = model;
    response.final = true;
    await saveMessage(response);
    await saveConvo(response);
    sendMessage(res, response);
    res.end();
  } catch (error) {
    console.log(error);
    await deleteMessages({ id: userMessageId });
    handleError(res, error.message);
  }
});

module.exports = router;
