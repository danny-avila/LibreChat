const { promptTokensEstimate } = require('openai-chat-tokens');
const { formatFromLangChain } = require('../prompts');

const createStartHandler = ({ req, res, context }) => {
  return async (_llm, _messages, runId, _parentRunId, extraParams) => {
    // extraParams.invocation_params.model
    const { invocation_params } = extraParams;
    const { model, functions, function_call } = invocation_params;
    const messages = _messages[0].map(formatFromLangChain);
    console.log(`handleChatModelStart: ${context}`, req, res);
    console.dir({ model, functions, function_call }, { depth: null });
    const payload = { messages };
    if (functions) {
      payload.functions = functions;
    }
    if (function_call) {
      payload.function_call = function_call;
    }
    const result = promptTokensEstimate(payload) + 3;
    console.log('Prompt Tokens pre-gen:', result);
  };
};

module.exports = createStartHandler;
