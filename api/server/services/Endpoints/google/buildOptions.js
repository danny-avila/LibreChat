const buildOptions = (endpoint, parsedBody) => {
  const { examples, modelLabel, promptPrefix, iconURL, greeting, spec, ...rest } = parsedBody;
  const endpointOption = {
    examples,
    endpoint,
    modelLabel,
    promptPrefix,
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
