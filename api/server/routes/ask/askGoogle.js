const express = require('express');
const router = express.Router();
const { titleConvo } = require('../../../app/');
const GoogleClient = require('../../../app/google/GoogleClient');
const { saveMessage, getConvoTitle, saveConvo, getConvo } = require('../../../models');
const { handleError, sendMessage, createOnProgress } = require('./handlers');
const requireJwtAuth = require('../../../middleware/requireJwtAuth');

router.post('/', requireJwtAuth, async (req, res) => {
  const { endpoint, text, parentMessageId, conversationId } = req.body;
  if (text.length === 0) return handleError(res, { text: 'Prompt empty or too short' });
  if (endpoint !== 'google') return handleError(res, { text: 'Illegal request' });

  // build endpoint option
  const endpointOption = {
    examples: req.body?.examples ?? [{ input: { content: '' }, output: { content: '' } }],
    promptPrefix: req.body?.promptPrefix ?? null,
    token: req.body?.token ?? null,
    modelOptions: {
      model: req.body?.model ?? 'chat-bison',
      modelLabel: req.body?.modelLabel ?? null,
      temperature: req.body?.temperature ?? 0.2,
      maxOutputTokens: req.body?.maxOutputTokens ?? 1024,
      topP: req.body?.topP ?? 0.95,
      topK: req.body?.topK ?? 40
    }
  };

  const availableModels = ['chat-bison', 'text-bison'];
  if (availableModels.find((model) => model === endpointOption.modelOptions.model) === undefined) {
    return handleError(res, { text: `Illegal request: model` });
  }

  // eslint-disable-next-line no-use-before-define
  return await ask({
    text,
    endpointOption,
    conversationId,
    parentMessageId,
    req,
    res
  });
});

const ask = async ({ text, endpointOption, parentMessageId = null, conversationId, req, res }) => {
  res.writeHead(200, {
    Connection: 'keep-alive',
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Access-Control-Allow-Origin': '*',
    'X-Accel-Buffering': 'no'
  });
  let userMessage;
  let userMessageId;
  let responseMessageId;
  let lastSavedTimestamp = 0;

  try {
    const getIds = (data) => {
      userMessage = data.userMessage;
      userMessageId = userMessage.messageId;
      responseMessageId = data.responseMessageId;
      if (!conversationId) {
        conversationId = data.conversationId;
      }
    };

    const { onProgress: progressCallback } = createOnProgress({
      onProgress: ({ text: partialText }) => {
        const currentTimestamp = Date.now();
        if (currentTimestamp - lastSavedTimestamp > 500) {
          lastSavedTimestamp = currentTimestamp;
          saveMessage({
            messageId: responseMessageId,
            sender: 'PaLM2',
            conversationId,
            parentMessageId: userMessageId,
            text: partialText,
            unfinished: true,
            cancelled: false,
            error: false
          });
        }
      }
    });

    const abortController = new AbortController();

    let key;
    if (endpointOption.token) {
      key = JSON.parse(endpointOption.token);
      delete endpointOption.token;
      console.log('Using service account key provided by User for PaLM models');
    }

    try {
      if (!key) {
        key = require('../../../data/auth.json');
      }
    } catch (e) {
      console.log("No 'auth.json' file (service account key) found in /api/data/ for PaLM models");
    }

    const clientOptions = {
      // debug: true, // for testing
      reverseProxyUrl: process.env.GOOGLE_REVERSE_PROXY || null,
      proxy: process.env.PROXY || null,
      ...endpointOption
    };

    const client = new GoogleClient(key, clientOptions);

    let response = await client.sendMessage(text, {
      getIds,
      user: req.user.id,
      parentMessageId,
      conversationId,
      onProgress: progressCallback.call(null, { res, text, parentMessageId: userMessageId }),
      abortController
    });

    await saveConvo(req.user.id, {
      ...endpointOption,
      ...endpointOption.modelOptions,
      conversationId,
      endpoint: 'google'
    });

    await saveMessage(response);
    sendMessage(res, {
      title: await getConvoTitle(req.user.id, conversationId),
      final: true,
      conversation: await getConvo(req.user.id, conversationId),
      requestMessage: userMessage,
      responseMessage: response
    });
    res.end();

    if (parentMessageId == '00000000-0000-0000-0000-000000000000') {
      const title = await titleConvo({ text, response });
      await saveConvo(req.user.id, {
        conversationId,
        title
      });
    }
  } catch (error) {
    console.error(error);
    const errorMessage = {
      messageId: responseMessageId,
      sender: 'PaLM2',
      conversationId,
      parentMessageId,
      unfinished: false,
      cancelled: false,
      error: true,
      text: error.message
    };
    await saveMessage(errorMessage);
    handleError(res, errorMessage);
  }
};

module.exports = router;
