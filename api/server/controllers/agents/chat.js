const { v4 } = require('uuid');
const {
  Time,
  Constants,
  RunStatus,
  CacheKeys,
  ContentTypes,
  ToolCallTypes,
  EModelEndpoint,
  retrievalMimeTypes,
} = require('librechat-data-provider');
const { createErrorHandler } = require('~/server/controllers/assistants/errors');
const { sendMessage, isEnabled, countTokens } = require('~/server/utils');
const { createRun, StreamRunManager } = require('~/server/services/Runs');
const { addTitle } = require('~/server/services/Endpoints/assistants');
const { recordUsage } = require('~/server/services/Threads');
const { getTransactions } = require('~/models/Transaction');
const checkBalance = require('~/models/checkBalance');
const getLogStores = require('~/cache/getLogStores');
const { getModelMaxTokens } = require('~/utils');
const { getOpenAIClient } = require('./helpers');
const { logger } = require('~/config');

/**
 * @route POST /
 * @desc Chat with an assistant
 * @access Public
 * @param {Express.Request} req - The request object, containing the request data.
 * @param {Express.Response} res - The response object, used to send back a response.
 * @returns {void}
 */
const chatV2 = async (req, res) => {
  logger.debug('[/agents/chat/] req.body', req.body);

  /** @type {{files: MongoFile[]}} */
  const {
    text,
    model,
    endpoint,
    files = [],
    promptPrefix,
    agent_id,
    instructions,
    messageId: _messageId,
    conversationId: convoId,
    parentMessageId: _parentId = Constants.NO_PARENT,
  } = req.body;

  /** @type {string|undefined} - the current run id */
  let run_id;
  /** @type {string|undefined} - the parent messageId */
  let parentMessageId = _parentId;
  /** @type {import('librechat-data-provider').TConversation | null} */
  let conversation = null;
  /** @type {string[]} */
  let file_ids = [];

  const responseMessageId = v4();

  /** @type {string} - The conversation UUID - created if undefined */
  const conversationId = convoId ?? v4();

  const cache = getLogStores(CacheKeys.ABORT_KEYS);
  const cacheKey = `${req.user.id}:${conversationId}`;

  /** @type {Run | undefined} - The completed run, undefined if incomplete */
  let completedRun;

  // const getContext = () => ({
  //   run_id,
  //   endpoint,
  //   cacheKey,
  //   completedRun,
  //   agent_id,
  //   conversationId,
  //   parentMessageId,
  //   responseMessageId,
  // });

  // const handleError = createErrorHandler({ req, res, getContext });
  const handleError = async (error) => {
    logger.error('[/agents/chat/] Error', error);
  };

  try {
    res.on('close', async () => {
      if (!completedRun) {
        await handleError(new Error('Request closed'));
      }
    });

    // if (!agent_id) {
    //   completedRun = true;
    //   throw new Error('Missing agent_id');
    // }

    const checkBalanceBeforeRun = async () => {
      if (!isEnabled(process.env.CHECK_BALANCE)) {
        return;
      }
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
      const promptBuffer = parentMessageId === Constants.NO_PARENT && !convoId ? 200 : 0;
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
    };

    const { openai: _openai, client } = await getOpenAIClient({
      req,
      res,
      endpointOption: req.body.endpointOption,
      initAppClient: true,
    });

    /** @type {CreateRunBody | undefined} */
    const body = {
      agent_id,
      model,
    };

    if (promptPrefix) {
      body.additional_instructions = promptPrefix;
    }

    if (instructions) {
      body.instructions = instructions;
    }

    const promises = [checkBalanceBeforeRun()];
    await Promise.all(promises);

    // const sendInitialResponse = () => {
    //   sendMessage(res, {
    //     sync: true,
    //     conversationId,
    //     // messages: previousMessages,
    //     requestMessage,
    //     responseMessage: {
    //       user: req.user.id,
    //       // messageId: openai.responseMessage.messageId,
    //       parentMessageId: userMessageId,
    //       conversationId,
    //       agent_id,
    //       model: agent_id,
    //     },
    //   });
    // };

    /** @type {RunResponse | typeof StreamRunManager | undefined} */
    let response;

    logger.debug('[/agents/chat/] response', {
      run: response.run,
      steps: response.steps,
    });

    if (response.run.status === RunStatus.CANCELLED) {
      logger.debug('[/agents/chat/] Run cancelled, handled by `abortRun`');
      return res.end();
    }

    completedRun = response.run;

    // /** @type {ResponseMessage} */
    // const responseMessage = {
    //   ...(response.responseMessage ?? response.finalMessage),
    //   text: response.text,
    //   parentMessageId: userMessageId,
    //   conversationId,
    //   user: req.user.id,
    //   agent_id,
    //   model: agent_id,
    //   endpoint,
    // };

    sendMessage(res, {
      final: true,
      conversation,
      requestMessage: {
        parentMessageId,
      },
    });
    res.end();

    if (parentMessageId === Constants.NO_PARENT && !convoId) {
      addTitle(req, {
        text,
        responseText: response.text,
        conversationId,
        client,
      });
    }

    if (response.run.usage) {
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
};

module.exports = chatV2;
