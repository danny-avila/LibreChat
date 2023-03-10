const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { titleConvo, getCitations, citeText, askBing } = require('../../app/');
const { saveMessage, deleteMessages, saveConvo } = require('../../models');
const { handleError, sendMessage } = require('./handlers');
const citationRegex = /\[\^\d+?\^]/g;

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
      tokens = citeText(tokens, true);
      sendMessage(res, { text: tokens, message: true });
    };

    let response = await askBing({
      text,
      progressCallback,
      convo
    });

    console.log('BING RESPONSE');
    // console.dir(response, { depth: null });
    const hasCitations = response.response.match(citationRegex)?.length > 0;

    userMessage.conversationSignature =
      convo.conversationSignature || response.conversationSignature;
    userMessage.conversationId = convo.conversationId || response.conversationId;
    userMessage.invocationId = response.invocationId;
    await saveMessage(userMessage);

    if (!convo.conversationSignature) {
      response.title = await titleConvo({
        model,
        message: text,
        response: JSON.stringify(response.response)
      });
    }

    response.text = response.response;
    delete response.response;
    response.id = response.details.messageId;
    response.suggestions =
      response.details.suggestedResponses &&
      response.details.suggestedResponses.map((s) => s.text);
    response.sender = model;
    response.final = true;

    const links = getCitations(response);
    response.text =
      citeText(response) +
      (links?.length > 0 && hasCitations ? `\n<small>${links}</small>` : '');

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
