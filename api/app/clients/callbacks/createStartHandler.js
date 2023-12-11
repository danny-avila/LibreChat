const { promptTokensEstimate } = require('openai-chat-tokens');
const { EModelEndpoint } = require('librechat-data-provider');
const { formatFromLangChain } = require('~/app/clients/prompts');
const checkBalance = require('~/models/checkBalance');
const { isEnabled } = require('~/server/utils');

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

    if (manager.debug) {
      console.log(`handleChatModelStart: ${context}`);
      console.dir({ model, functions, function_call }, { depth: null });
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
    if (manager.debug) {
      console.log('Prelim Prompt Tokens & Token Buffer', prelimPromptTokens, tokenBuffer);
    }
    prelimPromptTokens += tokenBuffer;

    try {
      if (isEnabled(process.env.CHECK_BALANCE)) {
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
      console.error(`[${context}] checkBalance error`, err);
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
