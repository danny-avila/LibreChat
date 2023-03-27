const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const askBing = require('./askBing');
const askSydney = require('./askSydney');
const { titleConvo, askClient, browserClient, customClient } = require('../../app/');
const { getConvo, saveMessage, getConvoTitle, saveConvo, updateConvo } = require('../../models');
const { handleError, sendMessage, createOnProgress, handleText } = require('./handlers');
const { getMessages } = require('../../models/Message');

router.use('/bing', askBing);
router.use('/sydney', askSydney);

router.post('/', async (req, res) => {
  let { model, text, overrideParentMessageId=null, parentMessageId, conversationId: oldConversationId, ...convo } = req.body;
  if (text.length === 0) {
    return handleError(res, { text: 'Prompt empty or too short' });
  }

  console.log('model:', model, 'oldConvoId:', oldConversationId);
  const conversationId = oldConversationId || crypto.randomUUID();
  console.log('conversationId after old:', conversationId);

  const userMessageId = crypto.randomUUID();
  const userParentMessageId = parentMessageId || '00000000-0000-0000-0000-000000000000';
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

  // Chore: This creates a loose a stranded initial message for chatgptBrowser
  
  if (!overrideParentMessageId) {
    await saveMessage(userMessage);
  }
  
if (!overrideParentMessageId && model !== 'chatgptBrowser') { 
  await saveConvo(req?.session?.user?.username, { ...userMessage, model, ...convo });
}

  return await ask({
    userMessage,
    model,
    convo,
    preSendRequest: true,
    overrideParentMessageId,
    req,
    res
  });
});

const ask = async ({
  userMessage,
  overrideParentMessageId = null,
  model,
  convo,
  preSendRequest = true,
  req,
  res
}) => {
  let {
    text,
    parentMessageId: userParentMessageId,
    conversationId,
    messageId: userMessageId
  } = userMessage;

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

  if (preSendRequest) sendMessage(res, { message: userMessage, created: true });

  try {
    const progressCallback = createOnProgress();

    const abortController = new AbortController();
    res.on('close', () => {
      console.log('The client has disconnected.');
      // 执行其他操作
      abortController.abort();
    })

    let gptResponse = await client({
      text,
      onProgress: progressCallback.call(null, model, { res, text }),
      convo: {
        parentMessageId: userParentMessageId,
        conversationId,
        ...convo
      },
      ...convo,
      abortController
    });

    console.log('CLIENT RESPONSE', gptResponse);
    gptResponse.text = gptResponse.response;

    if (!gptResponse.parentMessageId) {
      // gptResponse.id = gptResponse.messageId;
      gptResponse.parentMessageId = overrideParentMessageId || userMessageId;
      // userMessage.conversationId = conversationId
      //   ? conversationId
      //   : gptResponse.conversationId;
      // await saveMessage(userMessage);
      delete gptResponse.response;
    }

    if (
      (gptResponse.text.includes('2023') && !gptResponse.text.trim().includes(' ')) ||
      gptResponse.text.toLowerCase().includes('no response') ||
      gptResponse.text.toLowerCase().includes('no answer')
    ) {
      await saveMessage({
        messageId: crypto.randomUUID(),
        sender: model,
        conversationId,
        parentMessageId: overrideParentMessageId || userMessageId,
        error: true,
        text: 'Prompt empty or too short'
      });
      return handleError(res, { text: 'Prompt empty or too short' });
    }

    gptResponse.sender = model === 'chatgptCustom' ? convo.chatGptLabel : model;
    gptResponse.model = model;
    // gptResponse.final = true;
    gptResponse.text = await handleText(gptResponse);

    
    if (convo.chatGptLabel?.length > 0 && model === 'chatgptCustom') {
      gptResponse.chatGptLabel = convo.chatGptLabel;
    }
    
    if (convo.promptPrefix?.length > 0 && model === 'chatgptCustom') {
      gptResponse.promptPrefix = convo.promptPrefix;
    }

    // override the parentMessageId, for the regeneration.
    gptResponse.parentMessageId = overrideParentMessageId || userMessageId;

    /* this is a hacky solution to get the browserClient working right, will refactor later */
    if (model === 'chatgptBrowser' && userParentMessageId.startsWith('000')) {
      await saveMessage({ ...userMessage, conversationId: gptResponse.conversationId });
    }

    await saveMessage(gptResponse);
    await updateConvo(req?.session?.user?.username, gptResponse);
    sendMessage(res, {
      title: await getConvoTitle(req?.session?.user?.username, conversationId),
      final: true,
      requestMessage: userMessage,
      responseMessage: gptResponse
    });
    res.end();

    if (userParentMessageId == '00000000-0000-0000-0000-000000000000') {
      const title = await titleConvo({ model, text, response: gptResponse });

      await updateConvo(
        req?.session?.user?.username,
        {
          /* again, for sake of browser client, will soon refactor */
          conversationId: model === 'chatgptBrowser' ? gptResponse.conversationId : conversationId,
          title
        }
      );
    }
  } catch (error) {
    console.log(error);
    // await deleteMessages({ messageId: userMessageId });
    const errorMessage = {
      messageId: crypto.randomUUID(),
      sender: model,
      conversationId,
      parentMessageId: overrideParentMessageId || userMessageId,
      error: true,
      text: error.message
    };
    await saveMessage(errorMessage);
    handleError(res, errorMessage);
  }
};

module.exports = router;
