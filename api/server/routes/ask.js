const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const askBing = require('./askBing');
const {
  titleConvo,
  askClient,
  browserClient,
  customClient,
  detectCode
} = require('../../app/');
const { saveMessage, deleteMessages, saveConvo } = require('../../models');
const { handleError, sendMessage } = require('./handlers');

router.use('/bing', askBing);

router.post('/', async (req, res) => {
  const { model, text, parentMessageId, conversationId, chatGptLabel, promptPrefix } =
    req.body;
  if (!text.trim().includes(' ') && text.length < 5) {
    return handleError(res, 'Prompt empty or too short');
  }

  const userMessageId = crypto.randomUUID();
  let userMessage = { id: userMessageId, sender: 'User', text };

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
