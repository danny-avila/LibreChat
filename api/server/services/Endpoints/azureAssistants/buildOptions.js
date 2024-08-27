const { removeNullishValues } = require('librechat-data-provider');
const generateArtifactsPrompt = require('~/app/clients/prompts/artifacts');

const buildOptions = (endpoint, parsedBody) => {
  // eslint-disable-next-line no-unused-vars
  const { promptPrefix, assistant_id, iconURL, greeting, spec, artifacts, ...modelOptions } =
    parsedBody;
  const endpointOption = removeNullishValues({
    endpoint,
    promptPrefix,
    assistant_id,
    iconURL,
    greeting,
    spec,
    modelOptions,
  });

  if (typeof artifacts === 'string') {
    endpointOption.artifactsPrompt = generateArtifactsPrompt({ endpoint, artifacts });
  }

  return endpointOption;
};

module.exports = buildOptions;
