const { removeNullishValues } = require('librechat-data-provider');
const artifactsPrompt = require('~/app/clients/prompts/artifacts');

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
    artifacts,
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

  if (artifacts === 'default') {
    endpointOption.promptPrefix = `${promptPrefix ?? ''}\n${artifactsPrompt}`.trim();
  }

  return endpointOption;
};

module.exports = buildOptions;
