const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { GoogleClient } = require('../../../app');
const { saveMessage, getConvoTitle, saveConvo, getConvo } = require('../../../models');
const { handleError, sendMessage, createOnProgress } = require('../../utils');
const { getUserKey, checkUserKeyExpiry } = require('../../services/UserService');
const { setHeaders } = require('../../middleware');

router.post('/', setHeaders, async (req, res) => {
  const { endpoint, text, parentMessageId, conversationId: oldConversationId } = req.body;
  if (text.length === 0) {
    return handleError(res, { text: 'Prompt empty or too short' });
  }
  if (endpoint !== 'google') {
    return handleError(res, { text: 'Illegal request' });
  }

  // build endpoint option
  const endpointOption = {
    examples: req.body?.examples ?? [{ input: { content: '' }, output: { content: '' } }],
    promptPrefix: req.body?.promptPrefix ?? null,
    key: req.body?.key ?? null,
    modelOptions: {
      model: req.body?.model ?? 'chat-bison',
      modelLabel: req.body?.modelLabel ?? null,
      temperature: req.body?.temperature ?? 0.2,
      maxOutputTokens: req.body?.maxOutputTokens ?? 1024,
      topP: req.body?.topP ?? 0.95,
      topK: req.body?.topK ?? 40,
    },
  };

  const availableModels = ['chat-bison', 'text-bison', 'codechat-bison'];
  if (availableModels.find((model) => model === endpointOption.modelOptions.model) === undefined) {
    return handleError(res, { text: 'Illegal request: model' });
  }

  const conversationId = oldConversationId || crypto.randomUUID();

  // eslint-disable-next-line no-use-before-define
  return await ask({
    text,
    endpointOption,
    conversationId,
    parentMessageId,
    req,
    res,
  });
});

const ask = async ({ text, endpointOption, parentMessageId = null, conversationId, req, res }) => {
  let userMessage;
  let userMessageId;
  // let promptTokens;
  let responseMessageId;
  let lastSavedTimestamp = 0;
  const { overrideParentMessageId = null } = req.body;
  const user = req.user.id;

  try {
    const getReqData = (data = {}) => {
      for (let key in data) {
        if (key === 'userMessage') {
          userMessage = data[key];
          userMessageId = data[key].messageId;
        } else if (key === 'responseMessageId') {
          responseMessageId = data[key];
          // } else if (key === 'promptTokens') {
          //   promptTokens = data[key];
        } else if (!conversationId && key === 'conversationId') {
          conversationId = data[key];
        }
      }

      sendMessage(res, { message: userMessage, created: true });
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
            parentMessageId: overrideParentMessageId || userMessageId,
            text: partialText,
            unfinished: true,
            cancelled: false,
            error: false,
            user,
          });
        }
      },
    });

    const abortController = new AbortController();

    const isUserProvided = process.env.PALM_KEY === 'user_provided';

    let key;
    if (endpointOption.key && isUserProvided) {
      checkUserKeyExpiry(
        endpointOption.key,
        'Your GOOGLE_TOKEN has expired. Please provide your token again.',
      );
      key = await getUserKey({ userId: user, name: 'google' });
      key = JSON.parse(key);
      delete endpointOption.key;
      console.log('Using service account key provided by User for PaLM models');
    }

    try {
      key = require('../../../data/auth.json');
    } catch (e) {
      console.log('No \'auth.json\' file (service account key) found in /api/data/ for PaLM models');
    }

    const clientOptions = {
      // debug: true, // for testing
      reverseProxyUrl: process.env.GOOGLE_REVERSE_PROXY || null,
      proxy: process.env.PROXY || null,
      ...endpointOption,
    };

    const client = new GoogleClient(key, clientOptions);

    let response = await client.sendMessage(text, {
      getReqData,
      user,
      conversationId,
      parentMessageId,
      overrideParentMessageId,
      onProgress: progressCallback.call(null, {
        res,
        text,
        parentMessageId: overrideParentMessageId || userMessageId,
      }),
      abortController,
    });

    if (overrideParentMessageId) {
      response.parentMessageId = overrideParentMessageId;
    }

    await saveConvo(user, {
      ...endpointOption,
      ...endpointOption.modelOptions,
      conversationId,
      endpoint: 'google',
    });

    await saveMessage({ ...response, user });
    sendMessage(res, {
      title: await getConvoTitle(user, conversationId),
      final: true,
      conversation: await getConvo(user, conversationId),
      requestMessage: userMessage,
      responseMessage: response,
    });
    res.end();
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
      text: error.message,
    };
    await saveMessage({ ...errorMessage, user });
    handleError(res, errorMessage);
  }
};

module.exports = router;
