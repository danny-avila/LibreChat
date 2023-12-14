const { getResponseSender } = require('librechat-data-provider');
const { sendMessage, createOnProgress } = require('~/server/utils');
const { saveMessage, getConvoTitle, getConvo } = require('~/models');
const { createAbortController, handleAbortError } = require('~/server/middleware');
const { logger } = require('~/config');

const EditController = async (req, res, next, initializeClient) => {
  let {
    text,
    generation,
    endpointOption,
    conversationId,
    responseMessageId,
    isContinued = false,
    parentMessageId = null,
    overrideParentMessageId = null,
  } = req.body;
  logger.debug('[EditController]', {
    text,
    generation,
    isContinued,
    conversationId,
    ...endpointOption,
  });
  let metadata;
  let userMessage;
  let promptTokens;
  let lastSavedTimestamp = 0;
  let saveDelay = 100;
  const sender = getResponseSender({ ...endpointOption, model: endpointOption.modelOptions.model });
  const userMessageId = parentMessageId;
  const user = req.user.id;

  const addMetadata = (data) => (metadata = data);
  const getReqData = (data = {}) => {
    for (let key in data) {
      if (key === 'userMessage') {
        userMessage = data[key];
      } else if (key === 'responseMessageId') {
        responseMessageId = data[key];
      } else if (key === 'promptTokens') {
        promptTokens = data[key];
      }
    }
  };

  const { onProgress: progressCallback, getPartialText } = createOnProgress({
    generation,
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
          unfinished: true,
          cancelled: false,
          isEdited: true,
          error: false,
          user,
        });
      }

      if (saveDelay < 500) {
        saveDelay = 500;
      }
    },
  });
  try {
    const getAbortData = () => ({
      conversationId,
      messageId: responseMessageId,
      sender,
      parentMessageId: overrideParentMessageId ?? userMessageId,
      text: getPartialText(),
      userMessage,
      promptTokens,
    });

    const { abortController, onStart } = createAbortController(req, res, getAbortData);

    const { client } = await initializeClient({ req, res, endpointOption });

    let response = await client.sendMessage(text, {
      user,
      generation,
      isContinued,
      isEdited: true,
      conversationId,
      parentMessageId,
      responseMessageId,
      overrideParentMessageId,
      ...endpointOption,
      onProgress: progressCallback.call(null, {
        res,
        text,
        parentMessageId: overrideParentMessageId ?? userMessageId,
      }),
      getReqData,
      onStart,
      addMetadata,
      abortController,
    });

    if (metadata) {
      response = { ...response, ...metadata };
    }

    if (overrideParentMessageId) {
      response.parentMessageId = overrideParentMessageId;
    }

    sendMessage(res, {
      title: await getConvoTitle(user, conversationId),
      final: true,
      conversation: await getConvo(user, conversationId),
      requestMessage: userMessage,
      responseMessage: response,
    });
    res.end();

    await saveMessage({ ...response, user });
    await saveMessage(userMessage);

    // TODO: add title service
  } catch (error) {
    const partialText = getPartialText();
    handleAbortError(res, req, error, {
      partialText,
      conversationId,
      sender,
      messageId: responseMessageId,
      parentMessageId: userMessageId ?? parentMessageId,
    });
  }
};

module.exports = EditController;
