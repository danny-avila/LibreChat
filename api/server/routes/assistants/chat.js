const crypto = require('crypto');
const OpenAI = require('openai');
const { logger } = require('~/config');
const express = require('express');
const { sendMessage } = require('~/server/utils');
const { runAssistant, createOnTextProgress } = require('~/server/services/AssistantService');
const { createRun } = require('~/server/services/Runs');
const { initThread } = require('~/server/services/Threads');

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
    const { assistant_id, messages, text: userMessage, messageId } = req.body;
    const conversationId = req.body.conversationId || crypto.randomUUID();
    // let thread_id = req.body.thread_id ?? 'thread_nZoiCbPauU60LqY1Q0ME1elg'; // for testing
    let thread_id = req.body.thread_id;

    if (!assistant_id) {
      throw new Error('Missing assistant_id');
    }

    const openai = new OpenAI(process.env.OPENAI_API_KEY);
    openai.req = req;
    openai.res = res;
    createOnTextProgress(openai);
    console.log(messages);

    const initThreadBody = {
      messages: [
        {
          role: 'user',
          content: userMessage,
          metadata: {
            messageId,
          },
        },
      ],
      metadata: {
        conversationId,
      },
    };

    const result = await initThread({ openai, body: initThreadBody, thread_id });
    // const { messages: _messages } = result;
    thread_id = result.thread_id;

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

    // TODO: parse responses, save to db, send to user

    sendMessage(res, {
      title: 'New Chat',
      final: true,
      conversation: {
        conversationId: 'fake-convo-id',
        title: 'New Chat',
      },
      requestMessage: {
        messageId: 'fake-user-message-id',
        parentMessageId: '00000000-0000-0000-0000-000000000000',
        conversationId: 'fake-convo-id',
        sender: 'User',
        text: req.body.text,
        isCreatedByUser: true,
      },
      responseMessage: {
        messageId: 'fake-response-id',
        conversationId: 'fake-convo-id',
        parentMessageId: 'fake-user-message-id',
        isCreatedByUser: false,
        isEdited: false,
        model: defaultModel,
        sender: 'Assistant',
        text: response.text,
      },
    });
    res.end();
  } catch (error) {
    // res.status(500).json({ error: error.message });
    logger.error('[/assistants/chat/]', error);
    res.end();
  }
});

module.exports = router;
