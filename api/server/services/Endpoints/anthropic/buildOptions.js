const buildOptions = (endpoint, parsedBody) => {
  const {
    modelLabel,
    promptPrefix,
    maxContextTokens,
    resendFiles = true,
    iconURL,
    greeting,
    spec,
    ...modelOptions
  } = parsedBody;

  const endpointOption = {
    endpoint,
    modelLabel,
    promptPrefix,
    resendFiles,
    iconURL,
    greeting,
    spec,
    maxContextTokens,
    modelOptions,
  };

  return endpointOption;
};

module.exports = buildOptions;
