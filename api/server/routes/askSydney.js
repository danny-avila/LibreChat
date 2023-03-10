const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { titleConvo, getCitations, citeText, askSydney } = require('../../app/');
const { saveMessage, deleteMessages, saveConvo, getConvoTitle } = require('../../models');
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

    let response = await askSydney({
      text,
      progressCallback,
      convo
    });

    console.log('SYDNEY RESPONSE');
    console.log(response.response);
    // console.dir(response, { depth: null });
    const hasCitations = response.response.match(citationRegex)?.length > 0;

    // Save sydney response
    response.id = response.messageId;
    // response.parentMessageId = convo.parentMessageId ? convo.parentMessageId : response.messageId;
    response.parentMessageId = response.messageId;
    response.invocationId = convo.invocationId ? convo.invocationId + 1 : 1;
    response.title = convo.jailbreakConversationId
      ? await getConvoTitle(convo.conversationId)
      : await titleConvo({
          model,
          message: text,
          response: JSON.stringify(response.response)
        });
    response.conversationId = convo.conversationId
      ? convo.conversationId
      : crypto.randomUUID();
    response.conversationSignature = convo.conversationSignature
      ? convo.conversationSignature
      : crypto.randomUUID();
    response.text = response.response;
    delete response.response;
    response.suggestions =
      response.details.suggestedResponses &&
      response.details.suggestedResponses.map((s) => s.text);
    response.sender = model;
    response.final = true;

    const links = getCitations(response);
    response.text =
      citeText(response) +
      (links?.length > 0 && hasCitations ? `\n<small>${links}</small>` : '');

    // Save user message
    userMessage.conversationId = response.conversationId;
    userMessage.parentMessageId = response.parentMessageId;
    await saveMessage(userMessage);

    // Save sydney response & convo, then send
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
