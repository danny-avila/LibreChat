const buildOptions = (endpoint, parsedBody) => {
  // eslint-disable-next-line no-unused-vars
  const { promptPrefix, assistant_id, iconURL, greeting, ...rest } = parsedBody;
  const endpointOption = {
    endpoint,
    promptPrefix,
    assistant_id,
    iconURL,
    greeting,
    modelOptions: {
      ...rest,
    },
  };

  return endpointOption;
};

module.exports = buildOptions;
