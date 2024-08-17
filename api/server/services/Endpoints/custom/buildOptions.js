const { removeNullishValues } = require('librechat-data-provider');

const buildOptions = (endpoint, parsedBody, endpointType) => {
  const {
    chatGptLabel,
    promptPrefix,
    maxContextTokens,
    resendFiles = true,
    imageDetail,
    iconURL,
    greeting,
    spec,
    ...modelOptions
  } = parsedBody;
  const endpointOption = removeNullishValues({
    endpoint,
    endpointType,
    chatGptLabel,
    promptPrefix,
    resendFiles,
    imageDetail,
    iconURL,
    greeting,
    spec,
    maxContextTokens,
    modelOptions,
  });

  return endpointOption;
};

module.exports = buildOptions;
