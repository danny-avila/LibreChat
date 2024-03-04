const crypto = require('crypto');
const express = require('express');
const { Constants } = require('librechat-data-provider');
const { saveMessage, getConvoTitle, saveConvo, getConvo } = require('~/models');
const { handleError, sendMessage, createOnProgress, handleText } = require('~/server/utils');
const { setHeaders } = require('~/server/middleware');
const { browserClient } = require('~/app/');
const { logger } = require('~/config');

const router = express.Router();

router.post('/', setHeaders, async (req, res) => {
  const {
    endpoint,
    text,
    overrideParentMessageId = null,
    parentMessageId,
    conversationId: oldConversationId,
  } = req.body;
  if (text.length === 0) {
    return handleError(res, { text: 'Prompt empty or too short' });
  }
  if (endpoint !== 'chatGPTBrowser') {
    return handleError(res, { text: 'Illegal request' });
  }

  // build user message
  const conversationId = oldConversationId || crypto.randomUUID();
  const isNewConversation = !oldConversationId;
  const userMessageId = crypto.randomUUID();
  const userParentMessageId = parentMessageId || Constants.NO_PARENT;
  const userMessage = {
    messageId: userMessageId,
    sender: 'User',
    text,
    parentMessageId: userParentMessageId,
    conversationId,
    isCreatedByUser: true,
  };

  // build endpoint option
  const endpointOption = {
    model: req.body?.model ?? 'text-davinci-002-render-sha',
    key: req.body?.key ?? null,
  };

  logger.debug('[/ask/chatGPTBrowser]', {
    userMessage,
    conversationId,
    ...endpointOption,
  });

  if (!overrideParentMessageId) {
    await saveMessage({ ...userMessage, user: req.user.id });
    await saveConvo(req.user.id, {
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
  overrideParentMessageId = null,
  req,
  res,
}) => {
  let { text, parentMessageId: userParentMessageId, messageId: userMessageId } = userMessage;
  const user = req.user.id;
  let responseMessageId = crypto.randomUUID();
  let getPartialMessage = null;
  try {
    let lastSavedTimestamp = 0;
    const { onProgress: progressCallback, getPartialText } = createOnProgress({
      onProgress: ({ text }) => {
        const currentTimestamp = Date.now();
        if (currentTimestamp - lastSavedTimestamp > 500) {
          lastSavedTimestamp = currentTimestamp;
          saveMessage({
            messageId: responseMessageId,
            sender: endpointOption?.jailbreak ? 'Sydney' : 'BingAI',
            conversationId,
            parentMessageId: overrideParentMessageId || userMessageId,
            text: text,
            unfinished: true,
            error: false,
            isCreatedByUser: false,
            user,
          });
        }
      },
    });

    getPartialMessage = getPartialText;
    const abortController = new AbortController();
    let i = 0;
    let response = await browserClient({
      text,
      parentMessageId: userParentMessageId,
      conversationId,
      ...endpointOption,
      abortController,
      userId: user,
      onProgress: progressCallback.call(null, { res, text }),
      onEventMessage: (eventMessage) => {
        let data = null;
        try {
          data = JSON.parse(eventMessage.data);
        } catch (e) {
          return;
        }

        sendMessage(res, {
          message: { ...userMessage, conversationId: data.conversation_id },
          created: i === 0,
        });

        if (i === 0) {
          i++;
        }
      },
    });

    logger.debug('[/ask/chatGPTBrowser]', response);

    const newConversationId = response.conversationId || conversationId;
    const newUserMassageId = response.parentMessageId || userMessageId;
    const newResponseMessageId = response.messageId;

    // STEP1 generate response message
    response.text = response.response || '**ChatGPT refused to answer.**';

    let responseMessage = {
      conversationId: newConversationId,
      messageId: responseMessageId,
      newMessageId: newResponseMessageId,
      parentMessageId: overrideParentMessageId || newUserMassageId,
      text: await handleText(response),
      sender: endpointOption?.chatGptLabel || 'ChatGPT',
      unfinished: false,
      error: false,
      isCreatedByUser: false,
    };

    await saveMessage({ ...responseMessage, user });
    responseMessage.messageId = newResponseMessageId;

    // STEP2 update the conversation

    // First update conversationId if needed
    let conversationUpdate = { conversationId: newConversationId, endpoint: 'chatGPTBrowser' };
    if (conversationId != newConversationId) {
      if (isNewConversation) {
        // change the conversationId to new one
        conversationUpdate = {
          ...conversationUpdate,
          conversationId: conversationId,
          newConversationId: newConversationId,
        };
      } else {
        // create new conversation
        conversationUpdate = {
          ...conversationUpdate,
          ...endpointOption,
        };
      }
    }

    await saveConvo(user, conversationUpdate);
    conversationId = newConversationId;

    // STEP3 update the user message
    userMessage.conversationId = newConversationId;
    userMessage.messageId = newUserMassageId;

    // If response has parentMessageId, the fake userMessage.messageId should be updated to the real one.
    if (!overrideParentMessageId) {
      await saveMessage({
        ...userMessage,
        user,
        messageId: userMessageId,
        newMessageId: newUserMassageId,
      });
    }
    userMessageId = newUserMassageId;

    sendMessage(res, {
      title: await getConvoTitle(user, conversationId),
      final: true,
      conversation: await getConvo(user, conversationId),
      requestMessage: userMessage,
      responseMessage: responseMessage,
    });
    res.end();

    if (userParentMessageId == Constants.NO_PARENT) {
      // const title = await titleConvo({ endpoint: endpointOption?.endpoint, text, response: responseMessage });
      const title = await response.details.title;
      await saveConvo(user, {
        conversationId: conversationId,
        title,
      });
    }
  } catch (error) {
    const errorMessage = {
      messageId: responseMessageId,
      sender: 'ChatGPT',
      conversationId,
      parentMessageId: overrideParentMessageId || userMessageId,
      unfinished: false,
      error: true,
      isCreatedByUser: false,
      text: `${getPartialMessage() ?? ''}\n\nError message: "${error.message}"`,
    };
    await saveMessage({ ...errorMessage, user });
    handleError(res, errorMessage);
  }
};

module.exports = router;
