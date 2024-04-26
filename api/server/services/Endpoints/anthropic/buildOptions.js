const buildOptions = (endpoint, parsedBody) => {
  const { modelLabel, promptPrefix, resendFiles, iconURL, greeting, ...rest } = parsedBody;
  const endpointOption = {
    endpoint,
    modelLabel,
    promptPrefix,
    resendFiles,
    iconURL,
    greeting,
    modelOptions: {
      ...rest,
    },
  };

  return endpointOption;
};

module.exports = buildOptions;
