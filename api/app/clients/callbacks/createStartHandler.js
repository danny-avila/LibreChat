const { promptTokensEstimate } = require('openai-chat-tokens');
const { formatFromLangChain } = require('../prompts');

const createStartHandler = ({ role }) => {
  return async (_llm, _messages, runId, _parentRunId, extraParams) => {
    // console.dir({ runId, extraParams }, { depth: null });
    // extraParams.invocation_params.model
    const { invocation_params } = extraParams;
    const { model, functions, function_call } = invocation_params;
    const messages = _messages[0].map(formatFromLangChain);
    console.log(`handleChatModelStart: ${role}`);
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
