const { parseConvo } = require('librechat-data-provider');

const buildOptions = (req) => {
  const { endpoint } = req.body;

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

  return endpointOption;
};

module.exports = buildOptions;
