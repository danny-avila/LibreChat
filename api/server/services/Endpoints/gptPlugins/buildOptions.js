const buildOptions = (endpoint, parsedBody) => {
  const {
    chatGptLabel,
    promptPrefix,
    agentOptions,
    tools,
    iconURL,
    greeting,
    spec,
    ...modelOptions
  } = parsedBody;
  const endpointOption = {
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
    modelOptions,
  };

  return endpointOption;
};

module.exports = buildOptions;
