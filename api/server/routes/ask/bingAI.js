const crypto = require('crypto');
const express = require('express');
const { Constants } = require('librechat-data-provider');
const { handleError, sendMessage, createOnProgress, handleText } = require('~/server/utils');
const { saveMessage, getConvoTitle, saveConvo, getConvo } = require('~/models');
const { setHeaders } = require('~/server/middleware');
const { titleConvoBing, askBing } = require('~/app');
const { logger } = require('~/config');

const router = express.Router();

router.post('/', setHeaders, async (req, res) => {
  const {
    endpoint,
    text,
    messageId,
    overrideParentMessageId = null,
    parentMessageId,
    conversationId: oldConversationId,
  } = req.body;
  if (text.length === 0) {
    return handleError(res, { text: 'Prompt empty or too short' });
  }
  if (endpoint !== 'bingAI') {
    return handleError(res, { text: 'Illegal request' });
  }

  // build user message
  const conversationId = oldConversationId || crypto.randomUUID();
  const isNewConversation = !oldConversationId;
  const userMessageId = messageId;
  const userParentMessageId = parentMessageId || Constants.NO_PARENT;
  let userMessage = {
    messageId: userMessageId,
    sender: 'User',
    text,
    parentMessageId: userParentMessageId,
    conversationId,
    isCreatedByUser: true,
  };

  // build endpoint option
  let endpointOption = {};
  if (req.body?.jailbreak) {
    endpointOption = {
      jailbreak: req.body?.jailbreak ?? false,
      jailbreakConversationId: req.body?.jailbreakConversationId ?? null,
      systemMessage: req.body?.systemMessage ?? null,
      context: req.body?.context ?? null,
      toneStyle: req.body?.toneStyle ?? 'creative',
      key: req.body?.key ?? null,
    };
  } else {
    endpointOption = {
      jailbreak: req.body?.jailbreak ?? false,
      systemMessage: req.body?.systemMessage ?? null,
      context: req.body?.context ?? null,
      conversationSignature: req.body?.conversationSignature ?? null,
      clientId: req.body?.clientId ?? null,
      invocationId: req.body?.invocationId ?? null,
      toneStyle: req.body?.toneStyle ?? 'creative',
      key: req.body?.key ?? null,
    };
  }

  logger.debug('[/ask/bingAI] ask log', {
    userMessage,
    endpointOption,
    conversationId,
  });

  if (!overrideParentMessageId) {
    await saveMessage(req, { ...userMessage, user: req.user.id });
    await saveConvo(req, {
      ...userMessage,
      ...endpointOption,
      conversationId,
      endpoint,
    });
  }

  // eslint-disable-next-line no-use-before-define
  return await ask({
    isNewConversation,
    userMessage,
    endpointOption,
    conversationId,
    preSendRequest: true,
    overrideParentMessageId,
    req,
    res,
  });
});

const ask = async ({
  isNewConversation,
  userMessage,
  endpointOption,
  conversationId,
  preSendRequest = true,
  overrideParentMessageId = null,
  req,
  res,
}) => {
  let { text, parentMessageId: userParentMessageId, messageId: userMessageId } = userMessage;
  const user = req.user.id;

  let responseMessageId = crypto.randomUUID();
  const model = endpointOption?.jailbreak ? 'Sydney' : 'BingAI';

  if (preSendRequest) {
    sendMessage(res, { message: userMessage, created: true });
  }

  let lastSavedTimestamp = 0;
  const { onProgress: progressCallback, getPartialText } = createOnProgress({
    onProgress: ({ text }) => {
      const currentTimestamp = Date.now();
      if (currentTimestamp - lastSavedTimestamp > 500) {
        lastSavedTimestamp = currentTimestamp;
        saveMessage(req, {
          messageId: responseMessageId,
          sender: model,
          conversationId,
          parentMessageId: overrideParentMessageId || userMessageId,
          model,
          text: text,
          unfinished: true,
          error: false,
          isCreatedByUser: false,
          user,
        });
      }
    },
  });
  const abortController = new AbortController();
  let bingConversationId = null;
  if (!isNewConversation) {
    const convo = await getConvo(user, conversationId);
    bingConversationId = convo.bingConversationId;
  }

  try {
    let response = await askBing({
      text,
      userId: user,
      parentMessageId: userParentMessageId,
      conversationId: bingConversationId ?? conversationId,
      ...endpointOption,
      onProgress: progressCallback.call(null, {
        res,
        text,
        parentMessageId: overrideParentMessageId || userMessageId,
      }),
      abortController,
    });

    logger.debug('[/ask/bingAI] BING RESPONSE', response);

    if (response.details && response.details.scores) {
      logger.debug('[/ask/bingAI] SCORES', response.details.scores);
    }

    const newConversationId = endpointOption?.jailbreak
      ? response.jailbreakConversationId
      : response.conversationId || conversationId;
    const newUserMessageId =
      response.parentMessageId || response.details.requestId || userMessageId;
    const newResponseMessageId = response.messageId || response.details.messageId;

    // STEP1 generate response message
    response.text =
      response.response || response.details.spokenText || '**Bing refused to answer.**';

    const partialText = getPartialText();
    let unfinished = false;
    if (partialText?.trim()?.length > response.text.length) {
      response.text = partialText;
      unfinished = false;
      //setting "unfinished" to false fix bing image generation error msg and allows to continue a convo after being triggered by censorship (bing does remember the context after a "censored error" so there is no reason to end the convo)
    }

    let responseMessage = {
      conversationId,
      bingConversationId: newConversationId,
      messageId: responseMessageId,
      newMessageId: newResponseMessageId,
      parentMessageId: overrideParentMessageId || newUserMessageId,
      sender: model,
      text: await handleText(response, true),
      model,
      suggestions:
        response.details.suggestedResponses &&
        response.details.suggestedResponses.map((s) => s.text),
      unfinished,
      error: false,
      isCreatedByUser: false,
    };

    await saveMessage(req, { ...responseMessage, user });
    responseMessage.messageId = newResponseMessageId;

    let conversationUpdate = {
      conversationId,
      bingConversationId: newConversationId,
      endpoint: 'bingAI',
    };

    if (endpointOption?.jailbreak) {
      conversationUpdate.jailbreak = true;
      conversationUpdate.jailbreakConversationId = response.jailbreakConversationId;
    } else {
      conversationUpdate.jailbreak = false;
      conversationUpdate.conversationSignature = response.encryptedConversationSignature;
      conversationUpdate.clientId = response.clientId;
      conversationUpdate.invocationId = response.invocationId;
    }

    await saveConvo(req, conversationUpdate);
    userMessage.messageId = newUserMessageId;

    // If response has parentMessageId, the fake userMessage.messageId should be updated to the real one.
    if (!overrideParentMessageId) {
      await saveMessage(req, {
        ...userMessage,
        user,
        messageId: userMessageId,
        newMessageId: newUserMessageId,
      });
    }
    userMessageId = newUserMessageId;

    sendMessage(res, {
      title: await getConvoTitle(user, conversationId),
      final: true,
      conversation: await getConvo(user, conversationId),
      requestMessage: userMessage,
      responseMessage: responseMessage,
    });
    res.end();

    if (userParentMessageId == Constants.NO_PARENT) {
      const title = await titleConvoBing({
        text,
        response: responseMessage,
      });

      await saveConvo(req, {
        conversationId: conversationId,
        title,
      });
    }
  } catch (error) {
    logger.error('[/ask/bingAI] Error handling BingAI response', error);
    const partialText = getPartialText();
    if (partialText?.length > 2) {
      const responseMessage = {
        messageId: responseMessageId,
        sender: model,
        conversationId,
        parentMessageId: overrideParentMessageId || userMessageId,
        text: partialText,
        model,
        unfinished: true,
        error: false,
        isCreatedByUser: false,
      };

      saveMessage(req, { ...responseMessage, user });

      return {
        title: await getConvoTitle(user, conversationId),
        final: true,
        conversation: await getConvo(user, conversationId),
        requestMessage: userMessage,
        responseMessage: responseMessage,
      };
    } else {
      logger.error('[/ask/bingAI] Error handling BingAI response', error);
      const errorMessage = {
        messageId: responseMessageId,
        sender: model,
        conversationId,
        parentMessageId: overrideParentMessageId || userMessageId,
        unfinished: false,
        error: true,
        text: error.message,
        model,
        isCreatedByUser: false,
      };
      await saveMessage(req, { ...errorMessage, user });
      handleError(res, errorMessage);
    }
  }
};

module.exports = router;
