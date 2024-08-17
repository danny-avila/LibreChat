const { removeNullishValues } = require('librechat-data-provider');

const buildOptions = (endpoint, parsedBody) => {
  // eslint-disable-next-line no-unused-vars
  const { promptPrefix, assistant_id, iconURL, greeting, spec, ...modelOptions } = parsedBody;
  const endpointOption = removeNullishValues({
    endpoint,
    promptPrefix,
    assistant_id,
    iconURL,
    greeting,
    spec,
    modelOptions,
  });

  return endpointOption;
};

module.exports = buildOptions;
