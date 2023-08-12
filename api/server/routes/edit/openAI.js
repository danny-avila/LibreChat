const express = require('express');
const router = express.Router();
const { parseConvo } = require('librechat-data-provider');
const { OpenAIClient } = require('../../../app');
const { getAzureCredentials, abortMessage } = require('../../../utils');
const { saveMessage, getConvoTitle, getConvo } = require('../../../models');
const { handleError, sendMessage, createOnProgress } = require('../handlers');
const requireJwtAuth = require('../../middleware/requireJwtAuth');

const abortControllers = new Map();

router.post('/abort', requireJwtAuth, async (req, res) => {
  try {
    return await abortMessage(req, res, abortControllers);
  } catch (err) {
    console.error(err);
  }
});

router.post('/', requireJwtAuth, async (req, res) => {
  const { endpoint, text, generation, parentMessageId, responseMessageId, conversationId } =
    req.body;
  console.log(`edit/${endpoint}/, req.body:`);
  // console.dir(req.body, { depth: null });
  if (text.length === 0) {
    return handleError(res, { text: 'Prompt empty or too short' });
  }
  const isOpenAI = endpoint === 'openAI' || endpoint === 'azureOpenAI';
  if (!isOpenAI) {
    return handleError(res, { text: 'Illegal request' });
  }

  // build endpoint option
  const parsedBody = parseConvo(endpoint, req.body);
  const { chatGptLabel, promptPrefix, ...rest } = parsedBody;
  const endpointOption = {
    chatGptLabel,
    promptPrefix,
    modelOptions: {
      ...rest,
    },
  };

  // console.log('edit log');
  // console.dir({ text, conversationId, endpointOption }, { depth: null });

  // eslint-disable-next-line no-use-before-define
  return await edit({
    text,
    generation,
    endpointOption,
    conversationId,
    parentMessageId,
    responseMessageId,
    endpoint,
    req,
    res,
  });
});

const edit = async ({
  text,
  generation,
  endpointOption,
  parentMessageId,
  responseMessageId,
  endpoint,
  conversationId,
  req,
  res,
}) => {
  res.writeHead(200, {
    Connection: 'keep-alive',
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Access-Control-Allow-Origin': '*',
    'X-Accel-Buffering': 'no',
  });
  let metadata;
  let userMessage;
  let lastSavedTimestamp = 0;
  const userMessageId = parentMessageId;
  const { overrideParentMessageId = null } = req.body;
  const user = req.user.id;

  const addMetadata = (data) => {
    metadata = data;
  };

  const getIds = (data) => {
    userMessage = data.userMessage;
  };

  const { onProgress: progressCallback, getPartialText } = createOnProgress({
    generation,
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
          error: false,
        });
      }
    },
  });

  const abortController = new AbortController();
  abortController.abortAsk = async function () {
    this.abort();

    const responseMessage = {
      messageId: responseMessageId,
      sender: endpointOption?.chatGptLabel || 'ChatGPT',
      conversationId,
      parentMessageId: overrideParentMessageId || userMessageId,
      text: generation + getPartialText(),
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
      responseMessage: responseMessage,
    };
  };

  const onStart = (userMessage) => {
    sendMessage(res, { message: userMessage, created: true });
    abortControllers.set(userMessage.conversationId, { abortController, ...endpointOption });
  };

  try {
    const clientOptions = {
      debug: true,
      // contextStrategy: 'refine',
      reverseProxyUrl: process.env.OPENAI_REVERSE_PROXY || null,
      proxy: process.env.PROXY || null,
      endpoint,
      ...endpointOption,
    };

    let openAIApiKey = req.body?.token ?? process.env.OPENAI_API_KEY;

    if (process.env.AZURE_API_KEY && endpoint === 'azureOpenAI') {
      clientOptions.azure = JSON.parse(req.body?.token) ?? getAzureCredentials();
      openAIApiKey = clientOptions.azure.azureOpenAIApiKey;
    }

    const client = new OpenAIClient(openAIApiKey, clientOptions);

    let response = await client.sendMessage(text, {
      user,
      isEdited: true,
      conversationId,
      parentMessageId,
      responseMessageId,
      overrideParentMessageId,
      getIds,
      onStart,
      addMetadata,
      abortController,
      onProgress: progressCallback.call(null, {
        res,
        text,
        parentMessageId: overrideParentMessageId || userMessageId,
      }),
    });

    if (metadata) {
      response = { ...response, ...metadata };
    }

    console.log(
      'promptTokens, completionTokens:',
      response.promptTokens,
      response.completionTokens,
    );
    await saveMessage(response);
    // const messages = await getMessages({ conversationId });
    // const userMessage = messages[messages.length - 2];
    // const fakeResponse = messages[messages.length - 1];
    // fakeResponse.text = `${fakeResponse.text}\n<---continued--->\n`;
    // fakeResponse.finish_reason = 'stop';

    sendMessage(res, {
      title: await getConvoTitle(req.user.id, conversationId),
      final: true,
      conversation: await getConvo(req.user.id, conversationId),
      requestMessage: userMessage,
      responseMessage: response,
    });
    res.end();
  } catch (error) {
    console.error(error);
    return await abortMessage(req, res, abortControllers);
  }
};

module.exports = router;
