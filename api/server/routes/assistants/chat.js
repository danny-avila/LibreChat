const { v4 } = require('uuid');
const express = require('express');
const { EModelEndpoint, Constants, RunStatus, CacheKeys } = require('librechat-data-provider');
const {
  initThread,
  recordUsage,
  saveUserMessage,
  checkMessageGaps,
  addThreadMetadata,
  saveAssistantMessage,
} = require('~/server/services/Threads');
const { runAssistant, createOnTextProgress } = require('~/server/services/AssistantService');
const { addTitle, initializeClient } = require('~/server/services/Endpoints/assistant');
const { createRun, sleep } = require('~/server/services/Runs');
const { getConvo } = require('~/models/Conversation');
const getLogStores = require('~/cache/getLogStores');
const { sendMessage } = require('~/server/utils');
const { logger } = require('~/config');

const router = express.Router();
const {
  setHeaders,
  handleAbort,
  handleAbortError,
  // validateEndpoint,
  buildEndpointOption,
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
router.post('/', buildEndpointOption, setHeaders, async (req, res) => {
  logger.debug('[/assistants/chat/] req.body', req.body);
  const {
    text,
    model,
    files = [],
    promptPrefix,
    assistant_id,
    instructions,
    thread_id: _thread_id,
    messageId: _messageId,
    conversationId: convoId,
    parentMessageId: _parentId = Constants.NO_PARENT,
  } = req.body;

  /** @type {Partial<TAssistantEndpoint>} */
  const assistantsConfig = req.app.locals?.[EModelEndpoint.assistants];

  if (assistantsConfig) {
    const { supportedIds, excludedIds } = assistantsConfig;
    const error = { message: 'Assistant not supported' };
    if (supportedIds?.length && !supportedIds.includes(assistant_id)) {
      return await handleAbortError(res, req, error, {
        sender: 'System',
        conversationId: convoId,
        messageId: v4(),
        parentMessageId: _messageId,
        error,
      });
    } else if (excludedIds?.length && excludedIds.includes(assistant_id)) {
      return await handleAbortError(res, req, error, {
        sender: 'System',
        conversationId: convoId,
        messageId: v4(),
        parentMessageId: _messageId,
      });
    }
  }

  /** @type {OpenAIClient} */
  let openai;
  /** @type {string|undefined} - the current thread id */
  let thread_id = _thread_id;
  /** @type {string|undefined} - the current run id */
  let run_id;
  /** @type {string|undefined} - the parent messageId */
  let parentMessageId = _parentId;
  /** @type {TMessage[]} */
  let previousMessages = [];

  const userMessageId = v4();
  const responseMessageId = v4();

  /** @type {string} - The conversation UUID - created if undefined */
  const conversationId = convoId ?? v4();

  const cache = getLogStores(CacheKeys.ABORT_KEYS);
  const cacheKey = `${req.user.id}:${conversationId}`;

  try {
    if (convoId && !_thread_id) {
      throw new Error('Missing thread_id for existing conversation');
    }

    if (!assistant_id) {
      throw new Error('Missing assistant_id');
    }

    /** @type {{ openai: OpenAIClient }} */
    const { openai: _openai, client } = await initializeClient({
      req,
      res,
      endpointOption: req.body.endpointOption,
      initAppClient: true,
    });

    openai = _openai;

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

    createOnTextProgress({
      openai,
      conversationId,
      userMessageId,
      messageId: responseMessageId,
      thread_id,
    });

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

    await saveUserMessage({ ...requestMessage, model });

    const conversation = {
      conversationId,
      // TODO: title feature
      title: 'New Chat',
      endpoint: EModelEndpoint.assistants,
      promptPrefix: promptPrefix,
      instructions: instructions,
      assistant_id,
      // model,
    };

    if (file_ids.length) {
      conversation.file_ids = file_ids;
    }

    /** @type {CreateRunBody} */
    const body = {
      assistant_id,
      model,
    };

    if (promptPrefix) {
      body.additional_instructions = promptPrefix;
    }

    if (instructions) {
      body.instructions = instructions;
    }

    /* NOTE:
     * By default, a Run will use the model and tools configuration specified in Assistant object,
     * but you can override most of these when creating the Run for added flexibility:
     */
    const run = await createRun({
      openai,
      thread_id,
      body,
    });

    run_id = run.id;
    await cache.set(cacheKey, `${thread_id}:${run_id}`);

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

    // todo: retry logic
    let response = await runAssistant({ openai, thread_id, run_id });
    logger.debug('[/assistants/chat/] response', response);

    if (response.run.status === RunStatus.IN_PROGRESS) {
      response = await runAssistant({
        openai,
        thread_id,
        run_id,
        in_progress: openai.in_progress,
      });
    }

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

    await saveAssistantMessage({ ...responseMessage, model });

    if (parentMessageId === Constants.NO_PARENT && !_thread_id) {
      addTitle(req, {
        text,
        responseText: openai.responseText,
        conversationId,
        client,
      });
    }

    await addThreadMetadata({
      openai,
      thread_id,
      messageId: responseMessage.messageId,
      messages: response.messages,
    });

    if (!response.run.usage) {
      await sleep(3000);
      const completedRun = await openai.beta.threads.runs.retrieve(thread_id, run.id);
      if (completedRun.usage) {
        await recordUsage({
          ...completedRun.usage,
          user: req.user.id,
          model: completedRun.model ?? model,
          conversationId,
        });
      }
    } else {
      await recordUsage({
        ...response.run.usage,
        user: req.user.id,
        model: response.run.model ?? model,
        conversationId,
      });
    }
  } catch (error) {
    if (error.message === 'Run cancelled') {
      return res.end();
    }

    logger.error('[/assistants/chat/]', error);

    if (!openai || !thread_id || !run_id) {
      return res.status(500).json({ error: 'The Assistant run failed to initialize' });
    }

    try {
      await cache.delete(cacheKey);
      const cancelledRun = await openai.beta.threads.runs.cancel(thread_id, run_id);
      logger.debug('Cancelled run:', cancelledRun);
    } catch (error) {
      logger.error('[abortRun] Error cancelling run', error);
    }

    await sleep(2000);
    try {
      const run = await openai.beta.threads.runs.retrieve(thread_id, run_id);
      await recordUsage({
        ...run.usage,
        model: run.model,
        user: req.user.id,
        conversationId,
      });
    } catch (error) {
      logger.error('[/assistants/chat/] Error fetching or processing run', error);
    }

    try {
      const runMessages = await checkMessageGaps({
        openai,
        run_id,
        thread_id,
        conversationId,
        latestMessageId: responseMessageId,
      });

      const finalEvent = {
        title: 'New Chat',
        final: true,
        conversation: await getConvo(req.user.id, conversationId),
        runMessages,
      };

      if (res.headersSent && finalEvent) {
        return sendMessage(res, finalEvent);
      }

      res.json(finalEvent);
    } catch (error) {
      logger.error('[/assistants/chat/] Error finalizing error process', error);
      return res.status(500).json({ error: 'The Assistant run failed' });
    }
  }
});

module.exports = router;
