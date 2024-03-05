const buildOptions = (endpoint, parsedBody) => {
  const { modelLabel, promptPrefix, resendImages, ...rest } = parsedBody;
  const endpointOption = {
    endpoint,
    modelLabel,
    promptPrefix,
    resendImages,
    modelOptions: {
      ...rest,
    },
  };

  return endpointOption;
};

module.exports = buildOptions;
