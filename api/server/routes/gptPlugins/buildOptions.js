const { parseConvo } = require('librechat-data-provider');
const { handleError } = require('../../utils');

const buildOptions = (req, res) => {
  const { endpoint, text, parentMessageId, conversationId } = req.body;
  if (text.length === 0) {
    return handleError(res, { text: 'Prompt empty or too short' });
  }
  if (endpoint !== 'gptPlugins') {
    return handleError(res, { text: 'Illegal request' });
  }

  const tools = req.body?.tools.map((tool) => tool.pluginKey) ?? [];
  // build endpoint option
  const parsedBody = parseConvo(endpoint, req.body);
  const { chatGptLabel, promptPrefix, agentOptions, ...rest } = parsedBody;
  const endpointOption = {
    tools,
    endpoint,
    chatGptLabel,
    promptPrefix,
    agentOptions,
    modelOptions: {
      ...rest,
    },
  };

  console.log('ask log');
  console.dir({ text, conversationId, endpointOption }, { depth: null });

  return { text, endpointOption, conversationId, parentMessageId };
};

module.exports = buildOptions;
