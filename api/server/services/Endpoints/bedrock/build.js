const { removeNullishValues } = require('librechat-data-provider');
const generateArtifactsPrompt = require('~/app/clients/prompts/artifacts');
const generateChartsPrompt = require('~/app/clients/prompts/charts');

const buildOptions = (endpoint, parsedBody) => {
  const {
    modelLabel: name,
    promptPrefix,
    maxContextTokens,
    resendFiles = true,
    imageDetail,
    iconURL,
    greeting,
    spec,
    artifacts,
    charts,
    ...model_parameters
  } = parsedBody;
  const endpointOption = removeNullishValues({
    endpoint,
    name,
    resendFiles,
    imageDetail,
    iconURL,
    greeting,
    spec,
    promptPrefix,
    maxContextTokens,
    model_parameters,
  });

  if (typeof artifacts === 'string') {
    endpointOption.artifactsPrompt = generateArtifactsPrompt({ endpoint, artifacts });
  }

  if (typeof charts === 'string') {
    endpointOption.chartsPrompt = generateChartsPrompt({ endpoint, charts });
  }

  return endpointOption;
};

module.exports = { buildOptions };
