const { removeNullishValues } = require('librechat-data-provider');
const generateArtifactsPrompt = require('~/app/clients/prompts/artifacts');
const generateChartsPrompt = require('~/app/clients/prompts/charts');

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
    charts,
    maxContextTokens,
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
