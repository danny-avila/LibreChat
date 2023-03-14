const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const askBing = require('./askBing');
const askSydney = require('./askSydney');
const {
  titleConvo,
  askClient,
  browserClient,
  customClient,
  detectCode
} = require('../../app/');
const { getConvo, saveMessage, getConvoTitle, saveConvo } = require('../../models');
const { handleError, sendMessage, createOnProgress } = require('./handlers');
const { getMessages } = require('../../models/Message');

router.use('/bing', askBing);
router.use('/sydney', askSydney);

router.post('/', async (req, res) => {
  let { model, text, parentMessageId, conversationId: oldConversationId , ...convo } = req.body;
  if (text.length === 0) {
    return handleError(res, { text: 'Prompt empty or too short' });
  }

  const conversationId = oldConversationId || crypto.randomUUID();

  const userMessageId = crypto.randomUUID();
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

  // if (model === 'chatgptCustom' && !chatGptLabel && conversationId) {
  //   const convo = await getConvo({ conversationId });
  //   if (convo) {
  //     console.log('found convo for custom gpt', { convo })
  //     chatGptLabel = convo.chatGptLabel;
  //     promptPrefix = convo.promptPrefix;
  //   }
  // }

  await saveMessage(userMessage);
  await saveConvo({ ...userMessage, model, ...convo });

  return await ask({
    userMessage, 
    model,
    convo,
    preSendRequest: true,
    req, res 
  });
})

router.post('/regenerate', async (req, res) => {
  const { parentMessageId, model, chatGptLabel, promptPrefix } = req.body;

  const oldUserMessage = await getMessages({ messageId: req.body })

  if (oldUserMessage) {
    const convo = await getConvo(userMessage?.conversationId)

    const userMessageId = crypto.randomUUID();

    let userMessage = {
      ...userMessage,
      messageId: userMessageId, 
    };

    console.log('ask log for regeneration', {
      model,
      ...userMessage,
      ...convo
    });

    return await ask({
      userMessage, 
      model,
      convo,
      preSendRequest: false,
      req, res 
    });
  } else 
    return handleError(res, { text: 'Parent message not found' });

  // if (model === 'chatgptCustom' && !chatGptLabel && conversationId) {
  //   const convo = await getConvo({ conversationId });
  //   if (convo) {
  //     console.log('found convo for custom gpt', { convo })
  //     chatGptLabel = convo.chatGptLabel;
  //     promptPrefix = convo.promptPrefix;
  //   }
  // }

  // await saveConvo({ ...userMessage, model, chatGptLabel, promptPrefix });
});

const ask = async ({ 
  userMessage, 
  overrideParentMessageId = null,
  model,
  convo,
  preSendRequest = true,
  req, res 
}) => {
  let { sender, text, parentMessageId: userParentMessageId, conversationId, messageId: userMessageId } = userMessage;

  let client;

  if (model === 'chatgpt') {
    client = askClient;
  } else if (model === 'chatgptCustom') {
    client = customClient;
  } else {
    client = browserClient;
  }

  res.writeHead(200, {
    Connection: 'keep-alive',
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Access-Control-Allow-Origin': '*',
    'X-Accel-Buffering': 'no'
  });

  if (preSendRequest)
    sendMessage(res, { message: userMessage, created: true });

  try {
    const progressCallback = createOnProgress();
    let gptResponse = await client({
      text,
      onProgress: progressCallback.call(null, model, {res, text }),
      convo: {
        parentMessageId: userParentMessageId,
        conversationId,
        ...convo
      },
      ...convo
    });

    console.log('CLIENT RESPONSE', gptResponse);

    if (!gptResponse.parentMessageId) {
      gptResponse.text = gptResponse.response;
      // gptResponse.id = gptResponse.messageId;
      gptResponse.parentMessageId = overrideParentMessageId || userMessageId;
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
      await saveMessage({ 
        messageId: crypto.randomUUID(), sender: model, 
        conversationId, parentMessageId: overrideParentMessageId || userMessageId,
        error: true, text: 'Prompt empty or too short'});
      return handleError(res, { text: 'Prompt empty or too short' });
    }

    gptResponse.sender = model === 'chatgptCustom' ? convo.chatGptLabel : model;
    // gptResponse.final = true;
    gptResponse.text = await detectCode(gptResponse.text);

    if (convo.chatGptLabel?.length > 0 && model === 'chatgptCustom') {
      gptResponse.chatGptLabel = convo.chatGptLabel;
    }

    if (convo.promptPrefix?.length > 0 && model === 'chatgptCustom') {
      gptResponse.promptPrefix = convo.promptPrefix;
    }

    // override the parentMessageId, for the regeneration.
    gptResponse.parentMessageId = overrideParentMessageId || userMessageId

    await saveMessage(gptResponse);
    await saveConvo(gptResponse);
    sendMessage(res, {
      title: await getConvoTitle(conversationId),
      final: true, 
      requestMessage: userMessage, 
      responseMessage: gptResponse
    });
    res.end();

    if (userParentMessageId == '00000000-0000-0000-0000-000000000000') {
      const title = await titleConvo({
        model,
        message: text,
        response: JSON.stringify(gptResponse?.text)
      });

      console.log('CONVERSATION TITLE', title);

      await saveConvo({
        conversationId,
        title
      })
    }
  } catch (error) {
    console.log(error);
    // await deleteMessages({ messageId: userMessageId });
    const errorMessage = { 
      messageId: crypto.randomUUID(), sender: model, 
      conversationId, parentMessageId: overrideParentMessageId || userMessageId,
      error: true, text: error.message}
    await saveMessage(errorMessage);
    handleError(res, errorMessage);
  }
};

module.exports = router;
