const buildOptions = (endpoint, parsedBody) => {
  const {
    examples,
    modelLabel,
    resendFiles = true,
    promptPrefix,
    iconURL,
    greeting,
    spec,
    ...modelOptions
  } = parsedBody;
  const endpointOption = {
    examples,
    endpoint,
    modelLabel,
    resendFiles,
    promptPrefix,
    iconURL,
    greeting,
    spec,
    modelOptions,
  };

  return endpointOption;
};

module.exports = buildOptions;
