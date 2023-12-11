const buildOptions = (endpoint, parsedBody) => {
  const { chatGptLabel, promptPrefix, ...rest } = parsedBody;
  const endpointOption = {
    endpoint,
    chatGptLabel,
    promptPrefix,
    modelOptions: {
      ...rest,
    },
  };

  return endpointOption;
};

module.exports = buildOptions;
