const { v4 } = require('uuid');
const express = require('express');
const {
  Constants,
  RunStatus,
  CacheKeys,
  EModelEndpoint,
  ViolationTypes,
} = require('librechat-data-provider');
const {
  initThread,
  recordUsage,
  saveUserMessage,
  checkMessageGaps,
  addThreadMetadata,
  saveAssistantMessage,
} = require('~/server/services/Threads');
const { runAssistant, createOnTextProgress } = require('~/server/services/AssistantService');
const { addTitle, initializeClient } = require('~/server/services/Endpoints/assistants');
const { sendResponse, sendMessage, sleep, isEnabled, countTokens } = require('~/server/utils');
const { getTransactions } = require('~/models/Transaction');
const { createRun } = require('~/server/services/Runs');
const checkBalance = require('~/models/checkBalance');
const { getConvo } = require('~/models/Conversation');
const getLogStores = require('~/cache/getLogStores');
const { getModelMaxTokens } = require('~/utils');
const { logger } = require('~/config');

const router = express.Router();
const {
  setHeaders,
  handleAbort,
  validateModel,
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
router.post('/', validateModel, buildEndpointOption, setHeaders, async (req, res) => {
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

  /** @type {Run | undefined} - The completed run, undefined if incomplete */
  let completedRun;

  const handleError = async (error) => {
    const defaultErrorMessage =
      'The Assistant run failed to initialize. Try sending a message in a new conversation.';
    const messageData = {
      thread_id,
      assistant_id,
      conversationId,
      parentMessageId,
      sender: 'System',
      user: req.user.id,
      shouldSaveMessage: false,
      messageId: responseMessageId,
      endpoint: EModelEndpoint.assistants,
    };

    if (error.message === 'Run cancelled') {
      return res.end();
    } else if (error.message === 'Request closed' && completedRun) {
      return;
    } else if (error.message === 'Request closed') {
      logger.debug('[/assistants/chat/] Request aborted on close');
    } else if (/Files.*are invalid/.test(error.message)) {
      const errorMessage = `Files are invalid, or may not have uploaded yet.${
        req.app.locals?.[EModelEndpoint.azureOpenAI].assistants
          ? ' If using Azure OpenAI, files are only available in the region of the assistant\'s model at the time of upload.'
          : ''
      }`;
      return sendResponse(res, messageData, errorMessage);
    } else if (error?.message?.includes(ViolationTypes.TOKEN_BALANCE)) {
      return sendResponse(res, messageData, error.message);
    } else {
      logger.error('[/assistants/chat/]', error);
    }

    if (!openai || !thread_id || !run_id) {
      return sendResponse(res, messageData, defaultErrorMessage);
    }

    await sleep(3000);

    try {
      const status = await cache.get(cacheKey);
      if (status === 'cancelled') {
        logger.debug('[/assistants/chat/] Run already cancelled');
        return res.end();
      }
      await cache.delete(cacheKey);
      const cancelledRun = await openai.beta.threads.runs.cancel(thread_id, run_id);
      logger.debug('[/assistants/chat/] Cancelled run:', cancelledRun);
    } catch (error) {
      logger.error('[/assistants/chat/] Error cancelling run', error);
    }

    await sleep(2000);

    let run;
    try {
      run = await openai.beta.threads.runs.retrieve(thread_id, run_id);
      await recordUsage({
        ...run.usage,
        model: run.model,
        user: req.user.id,
        conversationId,
      });
    } catch (error) {
      logger.error('[/assistants/chat/] Error fetching or processing run', error);
    }

    let finalEvent;
    try {
      const runMessages = await checkMessageGaps({
        openai,
        run_id,
        thread_id,
        conversationId,
        latestMessageId: responseMessageId,
      });

      finalEvent = {
        title: 'New Chat',
        final: true,
        conversation: await getConvo(req.user.id, conversationId),
        runMessages,
      };
    } catch (error) {
      logger.error('[/assistants/chat/] Error finalizing error process', error);
      return sendResponse(res, messageData, 'The Assistant run failed');
    }

    return sendResponse(res, finalEvent);
  };

  try {
    res.on('close', async () => {
      if (!completedRun) {
        await handleError(new Error('Request closed'));
      }
    });

    if (convoId && !_thread_id) {
      completedRun = true;
      throw new Error('Missing thread_id for existing conversation');
    }

    if (!assistant_id) {
      completedRun = true;
      throw new Error('Missing assistant_id');
    }

    if (isEnabled(process.env.CHECK_BALANCE)) {
      const transactions =
        (await getTransactions({
          user: req.user.id,
          context: 'message',
          conversationId,
        })) ?? [];

      const totalPreviousTokens = Math.abs(
        transactions.reduce((acc, curr) => acc + curr.rawAmount, 0),
      );

      // TODO: make promptBuffer a config option; buffer for titles, needs buffer for system instructions
      const promptBuffer = parentMessageId === Constants.NO_PARENT && !_thread_id ? 200 : 0;
      // 5 is added for labels
      let promptTokens = (await countTokens(text + (promptPrefix ?? ''))) + 5;
      promptTokens += totalPreviousTokens + promptBuffer;
      // Count tokens up to the current context window
      promptTokens = Math.min(promptTokens, getModelMaxTokens(model));

      await checkBalance({
        req,
        res,
        txData: {
          model,
          user: req.user.id,
          tokenType: 'prompt',
          amount: promptTokens,
        },
      });
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

    completedRun = response.run;

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
      completedRun = await openai.beta.threads.runs.retrieve(thread_id, run.id);
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
    await handleError(error);
  }
});

module.exports = router;
