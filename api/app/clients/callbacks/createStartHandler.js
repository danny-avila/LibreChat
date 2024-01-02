const { promptTokensEstimate } = require('openai-chat-tokens');
const { EModelEndpoint, supportsBalanceCheck } = require('librechat-data-provider');
const { formatFromLangChain } = require('~/app/clients/prompts');
const checkBalance = require('~/models/checkBalance');
const { isEnabled } = require('~/server/utils');
const { logger } = require('~/config');

const createStartHandler = ({
  context,
  conversationId,
  tokenBuffer = 0,
  initialMessageCount,
  manager,
}) => {
  return async (_llm, _messages, runId, parentRunId, extraParams) => {
    const { invocation_params } = extraParams;
    const { model, functions, function_call } = invocation_params;
    const messages = _messages[0].map(formatFromLangChain);

    logger.debug(`[createStartHandler] handleChatModelStart: ${context}`, {
      model,
      function_call,
    });

    if (context !== 'title') {
      logger.debug(`[createStartHandler] handleChatModelStart: ${context}`, {
        functions,
      });
    }

    const payload = { messages };
    let prelimPromptTokens = 1;

    if (functions) {
      payload.functions = functions;
      prelimPromptTokens += 2;
    }

    if (function_call) {
      payload.function_call = function_call;
      prelimPromptTokens -= 5;
    }

    prelimPromptTokens += promptTokensEstimate(payload);
    logger.debug('[createStartHandler]', {
      prelimPromptTokens,
      tokenBuffer,
    });
    prelimPromptTokens += tokenBuffer;

    try {
      // TODO: if plugins extends to non-OpenAI models, this will need to be updated
      if (isEnabled(process.env.CHECK_BALANCE) && supportsBalanceCheck[EModelEndpoint.openAI]) {
        const generations =
          initialMessageCount && messages.length > initialMessageCount
            ? messages.slice(initialMessageCount)
            : null;
        await checkBalance({
          req: manager.req,
          res: manager.res,
          txData: {
            user: manager.user,
            tokenType: 'prompt',
            amount: prelimPromptTokens,
            debug: manager.debug,
            generations,
            model,
            endpoint: EModelEndpoint.openAI,
          },
        });
      }
    } catch (err) {
      logger.error(`[createStartHandler][${context}] checkBalance error`, err);
      manager.abortController.abort();
      if (context === 'summary' || context === 'plugins') {
        manager.addRun(runId, { conversationId, error: err.message });
        throw new Error(err);
      }
      return;
    }

    manager.addRun(runId, {
      model,
      messages,
      functions,
      function_call,
      runId,
      parentRunId,
      conversationId,
      prelimPromptTokens,
    });
  };
};

module.exports = createStartHandler;
