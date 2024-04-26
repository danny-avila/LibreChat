const buildOptions = (endpoint, parsedBody) => {
  const { examples, modelLabel, promptPrefix, iconURL, greeting, ...rest } = parsedBody;
  const endpointOption = {
    examples,
    endpoint,
    modelLabel,
    promptPrefix,
    iconURL,
    greeting,
    modelOptions: {
      ...rest,
    },
  };

  return endpointOption;
};

module.exports = buildOptions;
