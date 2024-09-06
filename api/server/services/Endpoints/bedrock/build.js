const { removeNullishValues, bedrockInputParser } = require('librechat-data-provider');
const generateArtifactsPrompt = require('~/app/clients/prompts/artifacts');
const { logger } = require('~/config');

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
    ...model_parameters
  } = parsedBody;
  let parsedParams = model_parameters;
  try {
    parsedParams = bedrockInputParser.parse(model_parameters);
  } catch (error) {
    logger.warn('Failed to parse bedrock input', error);
  }
  const endpointOption = removeNullishValues({
    endpoint,
    name,
    resendFiles,
    imageDetail,
    iconURL,
    greeting,
    spec,
    instructions: promptPrefix,
    maxContextTokens,
    model_parameters: parsedParams,
  });

  if (typeof artifacts === 'string') {
    endpointOption.artifactsPrompt = generateArtifactsPrompt({ endpoint, artifacts });
  }

  return endpointOption;
};

module.exports = { buildOptions };
