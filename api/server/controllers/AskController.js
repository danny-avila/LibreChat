const { getResponseSender, Constants } = require('librechat-data-provider');
const { createAbortController, handleAbortError } = require('~/server/middleware');
const { sendMessage, createOnProgress, countTokens } = require('~/server/utils');
const { saveMessage, getConvo, User, ConvoToken } = require('~/models');
const { logger } = require('~/config');
// const { isPremiumModel } = require('~/config/premiumModels');
const { decreaseUnpremiumUserCredit } = require('~/utils/creditCheck');

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
  const user = req.user.id;

  const { credits, subscription } = await User.findById(user);

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
    if (!(subscription && subscription.active) && !credits <= 0) {
      throw new Error(
        'You have run out of credits. If you want to continue chatting with the premium models, you need to purchase more credits. Simply click the "Add Credits" button on the left to add more credits. ',
      );
    }
    // if (isPremiumModel(endpointOption.modelOptions.model) && credits <= 0) {
    if (credits <= 0) {
      throw new Error(
        'You have run out of credits. If you want to continue chatting with the premium models, you need to subscribe. Simply click the "Subscribe" button on the left to add more credits.',
      );
    }
    const { client } = await initializeClient({ req, res, endpointOption });

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
            model: client.modelOptions.model,
            unfinished: true,
            error: false,
            user,
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

    res.on('close', () => {
      logger.debug('[AskController] Request closed');
      if (!abortController) {
        return;
      } else if (abortController.signal.aborted) {
        return;
      } else if (abortController.requestCompleted) {
        return;
      }

      abortController.abort();
      logger.debug('[AskController] Request aborted on close');
    });

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
    // console.log('--- AskController -> response ---', response);

    const conversation = await getConvo(user, conversationId);
    conversation.title =
      conversation && !conversation.title ? null : conversation?.title || 'New Chat';

    if (client.options.attachments) {
      userMessage.files = client.options.attachments;
      conversation.model = endpointOption.modelOptions.model;
      delete userMessage.image_urls;
    }

    if (!abortController.signal.aborted) {
      sendMessage(res, {
        final: true,
        conversation,
        title: conversation.title,
        requestMessage: userMessage,
        responseMessage: response,
      });
      res.end();

      await saveMessage({ ...response, user });
      const inputTokens = await countTokens(text);
      const outputTokens = await countTokens(response.text);
      await decreaseUnpremiumUserCredit(req.user, endpointOption.modelOptions.model);

      const newConvoToken = new ConvoToken({
        inputTokens: inputTokens,
        outputTokens: outputTokens,
        endpoint: endpointOption.endpoint,
        model: endpointOption.modelOptions.model,
        user: req.user.id,
      });
      await newConvoToken.save();
    }

    await saveMessage(userMessage);

    if (addTitle && parentMessageId === Constants.NO_PARENT && newConvo) {
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
