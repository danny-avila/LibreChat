const { parseConvo } = require('librechat-data-provider');

const buildOptions = (req) => {
  const { endpoint } = req.body;

  // build endpoint option
  const parsedBody = parseConvo(endpoint, req.body);
  const { modelLabel, promptPrefix, ...rest } = parsedBody;
  const endpointOption = {
    endpoint,
    modelLabel,
    promptPrefix,
    modelOptions: {
      ...rest,
    },
  };

  return endpointOption;
};

module.exports = buildOptions;
