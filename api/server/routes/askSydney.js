const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { titleConvo, getCitations, citeText, askSydney } = require('../../app/');
const { saveMessage, saveConvo, getConvoTitle } = require('../../models');
const { handleError, sendMessage } = require('./handlers');
const citationRegex = /\[\^\d+?\^]/g;

router.post('/', async (req, res) => {
  const { model, text, parentMessageId, conversationId: oldConversationId, ...convo } = req.body;
  if (text.length === 0) {
    return handleError(res, 'Prompt empty or too short');
  }

  const conversationId = oldConversationId || crypto.randomUUID();

  const userMessageId = messageId;
  const userParentMessageId = parentMessageId || '00000000-0000-0000-0000-000000000000'
  let userMessage = {
    messageId: userMessageId, 
    sender: 'User', 
    text, 
    parentMessageId: userParentMessageId,
    conversationId, 
    isCreatedByUser: true 
 };


 console.log('ask log', {
    model,
    ...userMessage,
    ...convo
  });

  res.writeHead(200, {
    Connection: 'keep-alive',
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Access-Control-Allow-Origin': '*',
    'X-Accel-Buffering': 'no'
  });

  await saveMessage(userMessage);
  await saveConvo({ ...userMessage, model, chatGptLabel, promptPrefix });
  sendMessage(res, { message: userMessage, created: true });

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
      convo: {
        parentMessageId: userParentMessageId,
        conversationId,
        ...convo
      },
    });

    console.log('SYDNEY RESPONSE');
    console.log(response.response);
    // console.dir(response, { depth: null });
    const hasCitations = response.response.match(citationRegex)?.length > 0;

    // Save sydney response
    // response.id = response.messageId;
    // response.parentMessageId = convo.parentMessageId ? convo.parentMessageId : response.messageId;
    response.parentMessageId = response.messageId;
    response.invocationId = convo.invocationId ? convo.invocationId + 1 : 1;
    response.title = convo.jailbreakConversationId
      ? await getConvoTitle(conversationId)
      : await titleConvo({
          model,
          message: text,
          response: JSON.stringify(response.response)
        });
    response.conversationId = conversationId
      ? conversationId
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
    response.parentMessageId = gptResponse.parentMessageId || userMessage.messageId
    // response.final = true;

    const links = getCitations(response);
    response.text =
      citeText(response) +
      (links?.length > 0 && hasCitations ? `\n<small>${links}</small>` : '');

    // Save user message
    userMessage.conversationId = response.conversationId;
    await saveMessage(userMessage);

    // Save sydney response & convo, then send
    await saveMessage(response);
    await saveConvo(response);
    sendMessage(res, {
      title: await getConvoTitle(conversationId),
      final: true, 
      requestMessage: userMessage, 
      responseMessage: gptResponse
    });
    res.end();
  } catch (error) {
    console.log(error);
    // await deleteMessages({ messageId: userMessageId });
    await saveMessage({ 
      messageId: crypto.randomUUID(), sender: model, 
      conversationId, parentMessageId: userMessageId,
      error: true, text: error.message});
    handleError(res, error.message);
  }
});

module.exports = router;
