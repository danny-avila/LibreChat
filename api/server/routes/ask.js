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
  let { model, text, parentMessageId, conversationId: oldConversationId , chatGptLabel, promptPrefix } = req.body;
  if (text.length === 0) {
    return handleError(res, 'Prompt empty or too short');
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
    let i = 0;
    let tokens = '';
    const progressCallback = async (partial) => {
      if (i === 0 && typeof partial === 'object') {
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
        parentMessageId: userParentMessageId,
        conversationId
      },
      chatGptLabel,
      promptPrefix
    });

    console.log('CLIENT RESPONSE', gptResponse);

    if (!gptResponse.parentMessageId) {
      gptResponse.text = gptResponse.response;
      // gptResponse.id = gptResponse.messageId;
      gptResponse.parentMessageId = userMessage.messageId;
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

    // if (!parentMessageId) {
    //   gptResponse.title = await titleConvo({
    //     model,
    //     message: text,
    //     response: JSON.stringify(gptResponse.text)
    //   });
    // }
    gptResponse.sender = model === 'chatgptCustom' ? chatGptLabel : model;
    // gptResponse.final = true;
    gptResponse.text = await detectCode(gptResponse.text);

    if (chatGptLabel?.length > 0 && model === 'chatgptCustom') {
      gptResponse.chatGptLabel = chatGptLabel;
    }

    if (promptPrefix?.length > 0 && model === 'chatgptCustom') {
      gptResponse.promptPrefix = promptPrefix;
    }

    await saveMessage(gptResponse);
    await saveConvo(gptResponse);
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
