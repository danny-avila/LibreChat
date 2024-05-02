const buildOptions = (endpoint, parsedBody) => {
  const { modelLabel, promptPrefix, resendFiles, iconURL, greeting, spec, ...rest } = parsedBody;
  const endpointOption = {
    endpoint,
    modelLabel,
    promptPrefix,
    resendFiles,
    iconURL,
    greeting,
    spec,
    modelOptions: {
      ...rest,
    },
  };

  return endpointOption;
};

module.exports = buildOptions;
