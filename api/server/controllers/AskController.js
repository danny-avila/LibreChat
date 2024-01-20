const { getResponseSender } = require('librechat-data-provider');
const { sendMessage, createOnProgress } = require('~/server/utils');
const { saveMessage, getConvoTitle, getConvo, getMessagesCount } = require('~/models');
const { createAbortController, handleAbortError } = require('~/server/middleware');
const { logger } = require('~/config');
const trieSensitive = require('../../utils/trieSensitive');
const User = require('../../models/User');

const AskController = async (req, res, next, initializeClient, addTitle) => {
  let {
    text,
    endpointOption,
    conversationId,
    modelDisplayLabel,
    parentMessageId = null,
    overrideParentMessageId = null,
  } = req.body;

  logger.debug('[AskController]', { text, conversationId, ...endpointOption });

  let metadata;
  let userMessage;
  let promptTokens;
  let userMessageId;
  let responseMessageId;
  let lastSavedTimestamp = 0;
  let saveDelay = 100;
  const sender = getResponseSender({
    ...endpointOption,
    model: endpointOption.modelOptions.model,
    modelDisplayLabel,
  });
  const newConvo = !conversationId;
  const user = req.user.id;

  const addMetadata = (data) => (metadata = data);

  const getReqData = (data = {}) => {
    for (let key in data) {
      if (key === 'userMessage') {
        userMessage = data[key];
        userMessageId = data[key].messageId;
      } else if (key === 'responseMessageId') {
        responseMessageId = data[key];
      } else if (key === 'promptTokens') {
        promptTokens = data[key];
      } else if (!conversationId && key === 'conversationId') {
        conversationId = data[key];
      }
    }
  };

  let getText;

  try {
    // const { client } = await initializeClient({ req, res, endpointOption });

    const { onProgress: progressCallback, getPartialText } = createOnProgress({
      onProgress: ({ text: partialText }) => {
        const currentTimestamp = Date.now();

        if (currentTimestamp - lastSavedTimestamp > saveDelay) {
          lastSavedTimestamp = currentTimestamp;
          saveMessage({
            messageId: responseMessageId,
            sender,
            conversationId,
            parentMessageId: overrideParentMessageId ?? userMessageId,
            text: partialText,
            model: endpointOption.modelOptions.model,
            unfinished: true,
            error: false,
            user,
            senderId: req.user.id,
          });
        }

        if (saveDelay < 500) {
          saveDelay = 500;
        }
      },
    });

    getText = getPartialText;

    const getAbortData = () => ({
      sender,
      conversationId,
      messageId: responseMessageId,
      parentMessageId: overrideParentMessageId ?? userMessageId,
      text: getPartialText(),
      userMessage,
      promptTokens,
    });

    const { abortController, onStart } = createAbortController(req, res, getAbortData);
    // try {
    const { client } = await initializeClient({ req, res, endpointOption });

    const isSensitive = await trieSensitive.checkSensitiveWords(text);
    if (isSensitive) {
      //return handleError(res, { text: '请回避敏感词汇，谢谢！' });
      throw new Error('请回避敏感词汇，谢谢！');
    }

    let currentTime = new Date();
    const cur_user = await User.findById(req.user.id).exec();
    let quota = 0;
    if ('proMemberExpiredAt' in cur_user && cur_user.proMemberExpiredAt > currentTime) {
      // If not proMember, check quota
      quota = JSON.parse(process.env['CHAT_QUOTA_PER_DAY_PRO_MEMBER']);
    } else {
      quota = JSON.parse(process.env['CHAT_QUOTA_PER_DAY']);
    }

    let someTimeAgo = currentTime;
    someTimeAgo.setSeconds(currentTime.getSeconds() - 60 * 60 * 24); // 24 hours
    if (endpointOption.modelOptions.model in quota) {
      let messagesCount = await getMessagesCount({
        $and: [
          { senderId: req.user.id },
          { model: endpointOption.modelOptions.model },
          { updatedAt: { $gte: someTimeAgo } },
        ],
      });
      let dailyQuota = quota[endpointOption.modelOptions.model].toFixed(0);
      if (messagesCount >= dailyQuota) {
        throw new Error(
          `超出了您的使用额度(${endpointOption.modelOptions.model}模型每天${dailyQuota}条消息)。由于需要支付越来越多、每月上万元的API费用，如果您经常使用我们的服务，请通过此网页购买更多额度、支持我们持续提供GPT服务：https://iaitok.com`,
        );
      }
    }

    const messageOptions = {
      user,
      parentMessageId,
      conversationId,
      overrideParentMessageId,
      getReqData,
      onStart,
      addMetadata,
      abortController,
      onProgress: progressCallback.call(null, {
        res,
        text,
        parentMessageId: overrideParentMessageId || userMessageId,
      }),
    };

    let response = await client.sendMessage(text, messageOptions);

    if (overrideParentMessageId) {
      response.parentMessageId = overrideParentMessageId;
    }

    if (metadata) {
      response = { ...response, ...metadata };
    }

    response.endpoint = endpointOption.endpoint;

    if (client.options.attachments) {
      userMessage.files = client.options.attachments;
      delete userMessage.image_urls;
    }

    if (!abortController.signal.aborted) {
      sendMessage(res, {
        title: await getConvoTitle(user, conversationId),
        final: true,
        conversation: await getConvo(user, conversationId),
        requestMessage: userMessage,
        responseMessage: response,
      });
      res.end();

      await saveMessage({ ...response, user });
    }

    await saveMessage(userMessage);

    if (addTitle && parentMessageId === '00000000-0000-0000-0000-000000000000' && newConvo) {
      addTitle(req, {
        text,
        response,
        client,
      });
    }
  } catch (error) {
    const partialText = getText && getText();
    handleAbortError(res, req, error, {
      partialText,
      conversationId,
      sender,
      messageId: responseMessageId,
      parentMessageId: userMessageId ?? parentMessageId,
    });
  }
};

module.exports = AskController;
