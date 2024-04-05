const buildOptions = (endpoint, parsedBody) => {
  const { examples, modelLabel, promptPrefix, ...rest } = parsedBody;
  const endpointOption = {
    examples,
    endpoint,
    modelLabel,
    promptPrefix,
    modelOptions: {
      ...rest,
    },
  };

  return endpointOption;
};

module.exports = buildOptions;
