const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const askBing = require('./askBing');
const askSydney = require('./askSydney');
const { titleConvo, askClient, browserClient, customClient } = require('../../app/');
const { saveMessage, getConvoTitle, saveConvo, updateConvo } = require('../../models');
const { handleError, sendMessage, createOnProgress, handleText } = require('./handlers');

router.use('/bing', askBing);
router.use('/sydney', askSydney);

router.post('/', async (req, res) => {
  const {
    model,
    text,
    overrideParentMessageId = null,
    parentMessageId,
    conversationId: oldConversationId,
    ...convo
  } = req.body;
  if (text.length === 0) return handleError(res, { text: 'Prompt empty or too short' });

  const conversationId = oldConversationId || crypto.randomUUID();
  const userMessageId = crypto.randomUUID();
  const userParentMessageId = parentMessageId || '00000000-0000-0000-0000-000000000000';
  const userMessage = {
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

  if (!overrideParentMessageId) {
    await saveMessage(userMessage);
    await saveConvo(req?.session?.user?.username, { ...userMessage, model, ...convo });
  }

  return await ask({ userMessage, model, convo, preSendRequest: true, overrideParentMessageId, req, res });
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
  const {
    text,
    parentMessageId: userParentMessageId,
    conversationId,
    messageId: userMessageId
  } = userMessage;

  const client = model === 'chatgpt' ? askClient : model === 'chatgptCustom' ? customClient : browserClient;

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
    res.on('close', () => abortController.abort());
    let gptResponse = await client({
      text,
      onProgress: progressCallback.call(null, model, { res, text }),
      convo: { parentMessageId: userParentMessageId, conversationId, ...convo },
      ...convo,
      abortController
    });

    gptResponse.text = gptResponse.response;
    console.log('CLIENT RESPONSE', gptResponse);

    if (!gptResponse.parentMessageId) {
      gptResponse.parentMessageId = overrideParentMessageId || userMessageId;
      delete gptResponse.response;
    }

    gptResponse.sender = model === 'chatgptCustom' ? convo.chatGptLabel : model;
    gptResponse.model = model;
    gptResponse.text = await handleText(gptResponse);
    if (convo.chatGptLabel?.length > 0 && model === 'chatgptCustom') {
      gptResponse.chatGptLabel = convo.chatGptLabel;
    }

    if (convo.promptPrefix?.length > 0 && model === 'chatgptCustom') {
      gptResponse.promptPrefix = convo.promptPrefix;
    }

    gptResponse.parentMessageId = overrideParentMessageId || userMessageId;

    if (model === 'chatgptBrowser' && userParentMessageId.startsWith('000')) {
      await saveMessage({ ...userMessage, conversationId: gptResponse.conversationId });
    }

    await saveMessage(gptResponse);
    await updateConvo(req?.session?.user?.username, {
      ...gptResponse,
      oldConvoId: model === 'chatgptBrowser' && conversationId
    });
    sendMessage(res, {
      title: await getConvoTitle(req?.session?.user?.username, conversationId),
      final: true,
      requestMessage: userMessage,
      responseMessage: gptResponse
    });
    res.end();

    if (userParentMessageId == '00000000-0000-0000-0000-000000000000') {
      const title = await titleConvo({ model, text, response: gptResponse });
      await updateConvo(req?.session?.user?.username, {
        conversationId: model === 'chatgptBrowser' ? gptResponse.conversationId : conversationId,
        title
      });
    }
  } catch (error) {
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
