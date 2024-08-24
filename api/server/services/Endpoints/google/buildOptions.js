const { removeNullishValues } = require('librechat-data-provider');
const artifactsPrompt = require('~/app/clients/prompts/artifacts');

const buildOptions = (endpoint, parsedBody) => {
  const {
    examples,
    modelLabel,
    resendFiles = true,
    promptPrefix,
    iconURL,
    greeting,
    spec,
    artifacts,
    ...modelOptions
  } = parsedBody;
  const endpointOption = removeNullishValues({
    examples,
    endpoint,
    modelLabel,
    resendFiles,
    promptPrefix,
    iconURL,
    greeting,
    spec,
    modelOptions,
  });

  if (artifacts === 'default') {
    endpointOption.promptPrefix = `${promptPrefix ?? ''}\n${artifactsPrompt}`.trim();
  }

  return endpointOption;
};

module.exports = buildOptions;
