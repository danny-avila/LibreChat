const buildOptions = (endpoint, parsedBody) => {
  // eslint-disable-next-line no-unused-vars
  const { promptPrefix, assistant_id, ...rest } = parsedBody;
  const endpointOption = {
    endpoint,
    promptPrefix,
    assistant_id,
    modelOptions: {
      ...rest,
    },
  };

  return endpointOption;
};

module.exports = buildOptions;
