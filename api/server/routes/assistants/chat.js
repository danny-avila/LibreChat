const OpenAI = require('openai');
const express = require('express');
const { EModelEndpoint, Constants } = require('librechat-data-provider');
const { initThread, saveUserMessage, saveAssistantMessage } = require('~/server/services/Threads');
const { runAssistant, createOnTextProgress } = require('~/server/services/AssistantService');
const { createRun } = require('~/server/services/Runs');
const { sendMessage } = require('~/server/utils');
const { logger } = require('~/config');

const router = express.Router();
const {
  setHeaders,
  // handleAbort,
  // handleAbortError,
  // validateEndpoint,
  // buildEndpointOption,
  // createAbortController,
} = require('~/server/middleware');

const defaultModel = 'gpt-3.5-turbo-1106';
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
      messages: _messages,
      text,
      messageId,
      files = [],
      promptPrefix,
      assistant_id,
      instructions,
      parentMessageId = Constants.NO_PARENT,
      // TODO: model is not currently sent from the frontend
      // maybe it should only be sent when changed from the assistant's model?
      model = defaultModel,
    } = req.body;

    /* NOTE:
     * conversationId is the thread_id; to manage multiple threads in one conversation adds significant complexity
     */
    let thread_id = req.body.conversationId;

    if (!assistant_id) {
      throw new Error('Missing assistant_id');
    }

    // TODO: needs to be initialized with `initializeClient`
    const openai = new OpenAI(process.env.OPENAI_API_KEY);
    openai.req = req;
    openai.res = res;
    createOnTextProgress(openai);

    // TODO: may allow multiple messages to be created beforehand in a future update
    const initThreadBody = {
      messages: [
        {
          role: 'user',
          content: text,
          metadata: {
            messageId,
          },
        },
      ],
      metadata: {
        user: req.user.id,
      },
    };

    const result = await initThread({ openai, body: initThreadBody, thread_id });
    thread_id = result.thread_id;

    const conversation = {
      conversationId: thread_id,
      // TODO: title feature
      title: 'New Chat',
      endpoint: EModelEndpoint.assistant,
      promptPrefix: promptPrefix,
      instructions: instructions,
      assistant_id,
      model,
    };

    await saveUserMessage({
      user: req.user.id,
      text,
      messageId,
      parentMessageId,
      file_ids: files,
      conversationId: thread_id,
      assistant_id,
      model,
    });

    /* NOTE:
     * By default, a Run will use the model and tools configuration specified in Assistant object,
     * but you can override most of these when creating the Run for added flexibility:
     */
    const run = await createRun({
      openai,
      thread_id,
      body: { assistant_id, model: req.body.model ?? defaultModel },
    });

    // todo: retry logic
    const response = await runAssistant({ openai, thread_id, run_id: run.id });
    logger.debug('[/assistants/chat/] response', response);
    const responseMessage = {
      ...openai.responseMessage,
      parentMessageId: messageId,
      conversationId: thread_id,
      user: req.user.id,
      assistant_id,
      model,
    };

    // responseMessage.tokenCount = getTotalTokenCount(responseMessage.content);

    // TODO: parse responses, save to db, send to user

    sendMessage(res, {
      title: 'New Chat',
      final: true,
      conversation,
      requestMessage: {
        parentMessageId,
      },
    });
    res.end();

    await saveAssistantMessage(responseMessage);
  } catch (error) {
    // res.status(500).json({ error: error.message });
    logger.error('[/assistants/chat/]', error);
    res.end();
  }
});

module.exports = router;
