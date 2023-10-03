const { promptTokensEstimate } = require('openai-chat-tokens');
const { formatFromLangChain } = require('../prompts');
const checkBalance = require('../llm/checkBalance');

const createStartHandler = ({ context, conversationId, tokenBuffer = 0, manager }) => {
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
    }

    prelimPromptTokens += promptTokensEstimate(payload);
    if (manager.debug) {
      console.log('Prelim Prompt Tokens & Token Buffer', prelimPromptTokens, tokenBuffer);
    }
    prelimPromptTokens += tokenBuffer;

    await checkBalance({
      req: manager.req,
      res: manager.res,
      txData: {
        user: manager.user,
        tokenType: 'prompt',
        amount: prelimPromptTokens,
        debug: manager.debug,
        model,
      },
    });

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
