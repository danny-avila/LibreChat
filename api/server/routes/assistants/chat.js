const { v4 } = require('uuid');
const OpenAI = require('openai');
const express = require('express');
const { EModelEndpoint, Constants, RunStatus, CacheKeys } = require('librechat-data-provider');
const {
  initThread,
  saveUserMessage,
  // checkMessageGaps,
  addThreadMetadata,
  saveAssistantMessage,
} = require('~/server/services/Threads');
const { runAssistant, createOnTextProgress } = require('~/server/services/AssistantService');
const { createRun } = require('~/server/services/Runs');
const { getConvo } = require('~/models/Conversation');
const getLogStores = require('~/cache/getLogStores');
const { sendMessage } = require('~/server/utils');
const { logger } = require('~/config');

const router = express.Router();
const {
  setHeaders,
  handleAbort,
  // handleAbortError,
  // validateEndpoint,
  // buildEndpointOption,
} = require('~/server/middleware');

router.post('/abort', handleAbort());

/**
 * @route POST /
 * @desc Chat with an assistant
 * @access Public
 * @param {express.Request} req - The request object, containing the request data.
 * @param {express.Response} res - The response object, used to send back a response.
 * @returns {void}
 */
router.post('/', setHeaders, async (req, res) => {
  try {
    logger.debug('[/assistants/chat/] req.body', req.body);
    const {
      text,
      messageId: _messageId,
      files = [],
      promptPrefix,
      assistant_id,
      instructions,
      thread_id: _thread_id,
      conversationId: convoId,
      parentMessageId: _parentId = Constants.NO_PARENT,
      // TODO: model is not currently sent from the frontend
      // maybe it should only be sent when changed from the assistant's model?
      // model: _model = defaultModel,
    } = req.body;

    if (convoId && !_thread_id) {
      throw new Error('Missing thread_id for existing conversation');
    }

    // Temporary: Can't use 0613 models
    // const model = _model.replace(/gpt-4.*$/, 'gpt-4-1106-preview');

    /** @type {string|undefined} - the current thread id */
    let thread_id = _thread_id;

    let parentMessageId = _parentId;

    if (!assistant_id) {
      throw new Error('Missing assistant_id');
    }

    /** @type {string} - The conversation UUID - created if undefined */
    const conversationId = convoId ?? v4();
    const responseMessageId = v4();
    const userMessageId = v4();

    // TODO: needs to be initialized with `initializeClient`
    /** @type {OpenAIClient} */
    const openai = new OpenAI(process.env.OPENAI_API_KEY);
    openai.req = req;
    openai.res = res;
    createOnTextProgress({ openai, conversationId, userMessageId, messageId: responseMessageId });

    /** @type {TMessage[]} */
    let previousMessages = [];

    // if (thread_id) {
    //   previousMessages = await checkMessageGaps({ openai, thread_id, conversationId });
    // }

    if (previousMessages.length) {
      parentMessageId = previousMessages[previousMessages.length - 1].messageId;
    }

    const userMessage = {
      role: 'user',
      content: text,
      metadata: {
        messageId: userMessageId,
      },
    };

    let thread_file_ids = [];
    if (convoId) {
      const convo = await getConvo(req.user.id, convoId);
      if (convo && convo.file_ids) {
        thread_file_ids = convo.file_ids;
      }
    }

    const file_ids = files.map(({ file_id }) => file_id);
    if (file_ids.length || thread_file_ids.length) {
      userMessage.file_ids = file_ids;
      openai.attachedFileIds = new Set([...file_ids, ...thread_file_ids]);
    }

    // TODO: may allow multiple messages to be created beforehand in a future update
    const initThreadBody = {
      messages: [userMessage],
      metadata: {
        user: req.user.id,
        conversationId,
      },
    };

    const result = await initThread({ openai, body: initThreadBody, thread_id });
    thread_id = result.thread_id;

    const requestMessage = {
      user: req.user.id,
      text,
      messageId: userMessageId,
      parentMessageId,
      // TODO: make sure client sends correct format for `files`, use zod
      files,
      file_ids,
      conversationId,
      isCreatedByUser: true,
      assistant_id,
      thread_id,
      model: assistant_id,
    };

    previousMessages.push(requestMessage);

    sendMessage(res, {
      sync: true,
      conversationId,
      // messages: previousMessages,
      requestMessage,
      responseMessage: {
        user: req.user.id,
        messageId: openai.responseMessage.messageId,
        parentMessageId: userMessageId,
        conversationId,
        assistant_id,
        thread_id,
        model: assistant_id,
      },
    });

    await saveUserMessage(requestMessage);

    const conversation = {
      conversationId,
      // TODO: title feature
      title: 'New Chat',
      endpoint: EModelEndpoint.assistant,
      promptPrefix: promptPrefix,
      instructions: instructions,
      assistant_id,
      // model,
    };

    if (file_ids.length) {
      conversation.file_ids = file_ids;
    }

    /* NOTE:
     * By default, a Run will use the model and tools configuration specified in Assistant object,
     * but you can override most of these when creating the Run for added flexibility:
     */
    const run = await createRun({
      openai,
      thread_id,
      body: { assistant_id },
    });

    const cache = getLogStores(CacheKeys.ABORT_KEYS);
    await cache.set(thread_id, run.id);

    // todo: retry logic
    let response = await runAssistant({ openai, thread_id, run_id: run.id });
    logger.debug('[/assistants/chat/] response', response);

    if (response.run.status === RunStatus.IN_PROGRESS) {
      response = await runAssistant({
        openai,
        thread_id,
        run_id: run.id,
        in_progress: openai.in_progress,
      });
    }

    // TODO: failed run handling

    /** @type {ResponseMessage} */
    const responseMessage = {
      ...openai.responseMessage,
      parentMessageId: userMessageId,
      conversationId,
      user: req.user.id,
      assistant_id,
      thread_id,
      model: assistant_id,
    };

    // TODO: token count from usage returned in run

    // TODO: parse responses, save to db, send to user

    sendMessage(res, {
      title: 'New Chat',
      final: true,
      conversation,
      requestMessage: {
        parentMessageId,
        thread_id,
      },
    });
    res.end();

    await saveAssistantMessage(responseMessage);

    await addThreadMetadata({
      openai,
      thread_id,
      messageId: responseMessage.messageId,
      messages: response.messages,
    });
  } catch (error) {
    // res.status(500).json({ error: error.message });
    if (error.message !== 'Run cancelled') {
      logger.error('[/assistants/chat/]', error);
    }
    res.end();
  }
});

module.exports = router;
