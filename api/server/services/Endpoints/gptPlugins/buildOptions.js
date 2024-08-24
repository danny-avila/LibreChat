const { removeNullishValues } = require('librechat-data-provider');
const artifactsPrompt = require('~/app/clients/prompts/artifacts');

const buildOptions = (endpoint, parsedBody) => {
  const {
    chatGptLabel,
    promptPrefix,
    agentOptions,
    tools,
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
        .filter((toolName) => typeof toolName === 'string') ?? [],
    chatGptLabel,
    promptPrefix,
    agentOptions,
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
