const express = require('express');
const router = express.Router();
const { titleConvo, OpenAIClient } = require('../../../app');
const { getAzureCredentials, abortMessage } = require('../../../utils');
const { saveMessage, getConvoTitle, saveConvo, getConvo } = require('../../../models');
const {
  handleError,
  sendMessage,
  createOnProgress,
} = require('./handlers');
const requireJwtAuth = require('../../../middleware/requireJwtAuth');
const User = require('../../../models/User');
const { getMessagesCount } = require('../../../models/Message');
const trieSensitive = require('../../../utils/trieSensitive');

const abortControllers = new Map();

router.post('/abort', requireJwtAuth, async (req, res) => {
  return await abortMessage(req, res, abortControllers);
});

router.post('/', requireJwtAuth, async (req, res) => {
  const { endpoint, text, parentMessageId, conversationId } = req.body;
  if (text.length === 0) return handleError(res, { text: 'Prompt empty or too short' });
  const isOpenAI = endpoint === 'openAI' || endpoint === 'azureOpenAI';
  if (!isOpenAI) return handleError(res, { text: 'Illegal request' });

  const isSensitive = await trieSensitive.checkSensitiveWords(text);
  if(isSensitive) return handleError(res, { text:'请回避敏感词汇，谢谢！' });
  // build endpoint option
  const endpointOption = {
    chatGptLabel: req.body?.chatGptLabel ?? null,
    promptPrefix: req.body?.promptPrefix ?? null,
    modelOptions: {
      model: req.body?.model ?? 'gpt-3.5-turbo',
      temperature: req.body?.temperature ?? 1,
      top_p: req.body?.top_p ?? 1,
      presence_penalty: req.body?.presence_penalty ?? 0,
      frequency_penalty: req.body?.frequency_penalty ?? 0
    }
  };

  let currentTime = new Date();
  const user = await User.findById(req.user.id).exec();
  let quota = 0;
  if (('proMemberExpiredAt' in user) && (user.proMemberExpiredAt > currentTime)) { // If not proMember, check quota
    quota = JSON.parse(process.env['CHAT_QUOTA_PER_DAY_PRO_MEMBER']);
  } else {
    quota = JSON.parse(process.env['CHAT_QUOTA_PER_DAY']);
  }

  let someTimeAgo = currentTime;
  someTimeAgo.setSeconds(currentTime.getSeconds() - 60 * 60 * 24); // 24 hours
  if (endpointOption.modelOptions.model in quota) {
    let messagesCount = await getMessagesCount({
      senderId: req.user.id,
      model: endpointOption.modelOptions.model,
      updatedAt: { $gte: someTimeAgo },
    });
    let dailyQuota = (quota[endpointOption.modelOptions.model]).toFixed(0);
    if (messagesCount >= dailyQuota) {
      return handleError(res, { text: `超出了您的使用额度(${endpointOption.modelOptions.model}模型每天${dailyQuota}条消息)，通过此网页购买更多额度：https://www.iaitok.com/pay` });
    }
  }

  console.log('ask log');
  console.dir({ text, conversationId, endpointOption }, { depth: null });

  // eslint-disable-next-line no-use-before-define
  return await ask({
    text,
    endpointOption,
    conversationId,
    parentMessageId,
    endpoint,
    req,
    res
  });
});

const ask = async ({ text, endpointOption, parentMessageId = null, endpoint, conversationId, req, res }) => {
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
  const newConvo = !conversationId;
  const { overrideParentMessageId = null } = req.body;
  const user = req.user.id;

  const getIds = (data) => {
    userMessage = data.userMessage;
    userMessageId = userMessage.messageId;
    responseMessageId = data.responseMessageId;
    if (!conversationId) {
      conversationId = data.conversationId;
    }
  };

  const { onProgress: progressCallback, getPartialText } = createOnProgress({
    onProgress: ({ text: partialText }) => {
      const currentTimestamp = Date.now();

      if (currentTimestamp - lastSavedTimestamp > 500) {
        lastSavedTimestamp = currentTimestamp;
        saveMessage({
          messageId: responseMessageId,
          sender: 'ChatGPT',
          conversationId,
          parentMessageId: overrideParentMessageId || userMessageId,
          text: partialText,
          model: endpointOption.modelOptions.model,
          unfinished: true,
          cancelled: false,
          error: false
        });
      }
    }
  });

  const abortController = new AbortController();
  abortController.abortAsk = async function () {
    this.abort();

    const responseMessage = {
      messageId: responseMessageId,
      sender: endpointOption?.chatGptLabel || 'ChatGPT',
      conversationId,
      parentMessageId: overrideParentMessageId || userMessageId,
      text: getPartialText(),
      model: endpointOption.modelOptions.model,
      unfinished: false,
      cancelled: true,
      error: false,
    };

    saveMessage(responseMessage);

    return {
      title: await getConvoTitle(req.user.id, conversationId),
      final: true,
      conversation: await getConvo(req.user.id, conversationId),
      requestMessage: userMessage,
      responseMessage: responseMessage
    };
  };

  const onStart = (userMessage) => {
    sendMessage(res, { message: userMessage, created: true });
    abortControllers.set(userMessage.conversationId, { abortController, ...endpointOption });
  };

  try {
    const clientOptions = {
      // debug: true,
      // contextStrategy: 'refine',
      reverseProxyUrl: process.env.OPENAI_REVERSE_PROXY || null,
      proxy: process.env.PROXY || null,
      endpoint,
      ...endpointOption
    };

    let oaiApiKey = req.body?.token ?? process.env.OPENAI_API_KEY;

    if (process.env.AZURE_API_KEY && endpoint === 'azureOpenAI') {
      clientOptions.azure = JSON.parse(req.body?.token) ?? getAzureCredentials();
      // clientOptions.reverseProxyUrl = process.env.AZURE_REVERSE_PROXY ?? genAzureChatCompletion({ ...clientOptions.azure });
      oaiApiKey = clientOptions.azure.azureOpenAIApiKey;
    }

    const client = new OpenAIClient(oaiApiKey, clientOptions);

    let response = await client.sendMessage(text, {
      user,
      parentMessageId,
      conversationId,
      overrideParentMessageId,
      getIds,
      onStart,
      onProgress: progressCallback.call(null, {
        res,
        text,
        parentMessageId: overrideParentMessageId || userMessageId
      }),
      abortController
    });

    if (overrideParentMessageId) {
      response.parentMessageId = overrideParentMessageId;
    }

    console.log('promptTokens, completionTokens:', response.promptTokens, response.completionTokens);
    await saveMessage(response);

    sendMessage(res, {
      title: await getConvoTitle(req.user.id, conversationId),
      final: true,
      conversation: await getConvo(req.user.id, conversationId),
      requestMessage: userMessage,
      responseMessage: response
    });
    res.end();

    if (parentMessageId == '00000000-0000-0000-0000-000000000000' && newConvo) {
      const title = await titleConvo({ text, response });
      await saveConvo(req.user.id, {
        conversationId,
        title
      });
    }
  } catch (error) {
    console.error(error);
    const partialText = getPartialText();
    if (partialText?.length > 2) {
      return await abortMessage(req, res, abortControllers);
    } else {
      const errorMessage = {
        messageId: responseMessageId,
        sender: 'ChatGPT',
        conversationId,
        parentMessageId: userMessageId,
        unfinished: false,
        cancelled: false,
        error: true,
        text: error.message
      };
      await saveMessage(errorMessage);
      handleError(res, errorMessage);
    }
  }
};

module.exports = router;
