const { parseConvo } = require('librechat-data-provider');

const buildOptions = (req) => {
  const { endpoint } = req.body;

  // build endpoint option
  const parsedBody = parseConvo(endpoint, req.body);
  const { chatGptLabel, promptPrefix, ...rest } = parsedBody;
  const endpointOption = {
    endpoint,
    chatGptLabel,
    promptPrefix,
    modelOptions: {
      ...rest,
    },
  };

  return endpointOption;
};

module.exports = buildOptions;
