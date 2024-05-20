const buildOptions = (endpoint, parsedBody) => {
  const {
    modelLabel,
    promptPrefix,
    maxContextTokens,
    resendFiles,
    iconURL,
    greeting,
    spec,
    ...rest
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
    modelOptions: {
      ...rest,
    },
  };

  return endpointOption;
};

module.exports = buildOptions;
