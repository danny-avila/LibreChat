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
const { getConvo, saveMessage, deleteMessagesSince, deleteMessages, saveConvo } = require('../../models');
const { handleError, sendMessage } = require('./handlers');

router.use('/bing', askBing);
router.use('/sydney', askSydney);

router.post('/', async (req, res) => {
  let { id, model, text, parentMessageId, conversationId, chatGptLabel, promptPrefix } = req.body;
  if (text.length === 0) {
    return handleError(res, 'Prompt empty or too short');
  }

  const userMessageId = id || crypto.randomUUID();
  let userMessage = { id: userMessageId, sender: 'User', text, parentMessageId, conversationId, isCreatedByUser: true };

  console.log('ask log', {
    model,
    ...userMessage,
    parentMessageId,
    conversationId,
    chatGptLabel,
    promptPrefix
  });

  let client;

  if (model === 'chatgpt') {
    client = askClient;
  } else if (model === 'chatgptCustom') {
    client = customClient;
  } else {
    client = browserClient;
  }

  if (model === 'chatgptCustom' && !chatGptLabel && conversationId) {
    const convo = await getConvo({ conversationId });
    if (convo) {
      console.log('found convo for custom gpt', { convo })
      chatGptLabel = convo.chatGptLabel;
      promptPrefix = convo.promptPrefix;
    }
  }

  if (id) {
    // existing conversation
    await saveMessage(userMessage);
    await deleteMessagesSince(userMessage);
  } else {}

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
        tokens += partial === text ? '' : partial;
        if (tokens.match(/^\n/)) {
          tokens = tokens.replace(/^\n/, '');
        }

        if (tokens.includes('[DONE]')) {
          tokens = tokens.replace('[DONE]', '');
        }

        // tokens = await detectCode(tokens);
        sendMessage(res, { text: tokens, message: true, initial: i === 0 ? true : false });
        i++;
      }
    };

    let gptResponse = await client({
      text,
      progressCallback,
      convo: {
        parentMessageId,
        conversationId
      },
      chatGptLabel,
      promptPrefix
    });

    console.log('CLIENT RESPONSE', gptResponse);

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

    if (!parentMessageId) {
      gptResponse.title = await titleConvo({
        model,
        message: text,
        response: JSON.stringify(gptResponse.text)
      });
    }
    gptResponse.sender = model === 'chatgptCustom' ? chatGptLabel : model;
    gptResponse.final = true;
    gptResponse.text = await detectCode(gptResponse.text);

    if (chatGptLabel?.length > 0 && model === 'chatgptCustom') {
      gptResponse.chatGptLabel = chatGptLabel;
    }

    if (promptPrefix?.length > 0 && model === 'chatgptCustom') {
      gptResponse.promptPrefix = promptPrefix;
    }

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
