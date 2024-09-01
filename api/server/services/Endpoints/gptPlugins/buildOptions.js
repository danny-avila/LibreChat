const { removeNullishValues } = require('librechat-data-provider');
const generateArtifactsPrompt = require('~/app/clients/prompts/artifacts');

const buildOptions = (endpoint, parsedBody) => {
  const {
    chatGptLabel,
    promptPrefix,
    agentOptions,
    tools = [],
    iconURL,
    greeting,
    spec,
    maxContextTokens,
    artifacts,
    ...modelOptions
  } = parsedBody;
  const endpointOption = removeNullishValues({
    endpoint,
    tools:
      tools
        .map((tool) => tool?.pluginKey ?? tool)
        .filter((toolName) => typeof toolName === 'string'),
    chatGptLabel,
    promptPrefix,
    agentOptions,
    iconURL,
    greeting,
    spec,
    maxContextTokens,
    modelOptions,
  });

  if (typeof artifacts === 'string') {
    endpointOption.artifactsPrompt = generateArtifactsPrompt({ endpoint, artifacts });
  }

  return endpointOption;
};

module.exports = buildOptions;
