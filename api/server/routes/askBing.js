const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { titleConvo, getCitations, citeText, askBing } = require('../../app/');
const { saveMessage, deleteMessages, deleteMessagesSince, saveConvo } = require('../../models');
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

    let response = await askBing({
      text,
      progressCallback,
      convo: {
        parentMessageId: userParentMessageId,
        conversationId,
        ...convo
      },
    });

    console.log('BING RESPONSE');
    // console.dir(response, { depth: null });
    const hasCitations = response.response.match(citationRegex)?.length > 0;

    userMessage.conversationSignature =
      convo.conversationSignature || response.conversationSignature;
    userMessage.conversationId = conversationId || response.conversationId;
    userMessage.invocationId = response.invocationId;
    await saveMessage(userMessage);

    // if (!convo.conversationSignature) {
    //   response.title = await titleConvo({
    //     model,
    //     message: text,
    //     response: JSON.stringify(response.response)
    //   });
    // }

    response.text = response.response;
    delete response.response;
    // response.id = response.details.messageId;
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

    await saveMessage(response);
    await saveConvo(response);
    sendMessage(res, {
      final: true, 
      requestMessage: userMessage, 
      responseMessage: gptResponse
    });
    res.end();
  } catch (error) {
    console.log(error);
    // await deleteMessages({ messageId: userMessageId });
    handleError(res, error.message);
  }
});

module.exports = router;
