const { removeNullishValues, anthropicSettings } = require('librechat-data-provider');
const generateArtifactsPrompt = require('~/app/clients/prompts/artifacts');
const generateChartsPrompt = require('~/app/clients/prompts/charts');

const buildOptions = (endpoint, parsedBody) => {
  const {
    modelLabel,
    promptPrefix,
    maxContextTokens,
    resendFiles = anthropicSettings.resendFiles.default,
    promptCache = anthropicSettings.promptCache.default,
    thinking = anthropicSettings.thinking.default,
    thinkingBudget = anthropicSettings.thinkingBudget.default,
    iconURL,
    greeting,
    spec,
    artifacts,
    charts,
    ...modelOptions
  } = parsedBody;

  const endpointOption = removeNullishValues({
    endpoint,
    modelLabel,
    promptPrefix,
    resendFiles,
    promptCache,
    thinking,
    thinkingBudget,
    iconURL,
    greeting,
    spec,
    maxContextTokens,
    modelOptions,
  });

  if (typeof artifacts === 'string') {
    endpointOption.artifactsPrompt = generateArtifactsPrompt({ endpoint, artifacts });
  }

  if (typeof charts === 'string') {
    endpointOption.chartsPrompt = generateChartsPrompt({ endpoint, charts });
  }

  return endpointOption;
};

module.exports = buildOptions;
