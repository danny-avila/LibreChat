const buildOptions = (endpoint, parsedBody) => {
  const { modelLabel, promptPrefix, resendFiles, ...rest } = parsedBody;
  const endpointOption = {
    endpoint,
    modelLabel,
    promptPrefix,
    resendFiles,
    modelOptions: {
      ...rest,
    },
  };

  return endpointOption;
};

module.exports = buildOptions;
