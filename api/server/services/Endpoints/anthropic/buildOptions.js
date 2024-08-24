const { removeNullishValues } = require('librechat-data-provider');
const artifactsPrompt = require('~/app/clients/prompts/artifacts');

const buildOptions = (endpoint, parsedBody) => {
  const {
    modelLabel,
    promptPrefix,
    maxContextTokens,
    resendFiles = true,
    promptCache = true,
    iconURL,
    greeting,
    spec,
    artifacts,
    ...modelOptions
  } = parsedBody;

  const endpointOption = removeNullishValues({
    endpoint,
    modelLabel,
    promptPrefix,
    resendFiles,
    promptCache,
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
