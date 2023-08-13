const { parseConvo } = require('librechat-data-provider');
const { handleError } = require('../../../utils');

const buildOptions = (req, res) => {
  const { endpoint, text, parentMessageId, conversationId } = req.body;
  if (text.length === 0) {
    return handleError(res, { text: 'Prompt empty or too short' });
  }
  if (endpoint !== 'gptPlugins') {
    return handleError(res, { text: 'Illegal request' });
  }

  // build endpoint option
  const parsedBody = parseConvo(endpoint, req.body);
  const {
    chatGptLabel,
    promptPrefix,
    agentOptions,
    tools,
    model,
    temperature,
    top_p,
    presence_penalty,
    frequency_penalty,
  } = parsedBody;
  const endpointOption = {
    endpoint,
    tools: tools.map((tool) => tool.pluginKey) ?? [],
    chatGptLabel,
    promptPrefix,
    agentOptions,
    modelOptions: {
      model,
      temperature,
      top_p,
      presence_penalty,
      frequency_penalty,
    },
  };

  console.log('ask log');
  console.dir({ text, conversationId, endpointOption }, { depth: null });

  return { text, endpointOption, conversationId, parentMessageId };
};

module.exports = buildOptions;
