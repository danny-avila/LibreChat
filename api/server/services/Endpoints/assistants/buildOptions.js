const buildOptions = (endpoint, parsedBody) => {
  // eslint-disable-next-line no-unused-vars
  const { promptPrefix, assistant_id, iconURL, greeting, spec, ...modelOptions } = parsedBody;
  const endpointOption = {
    endpoint,
    promptPrefix,
    assistant_id,
    iconURL,
    greeting,
    spec,
    modelOptions,
  };

  return endpointOption;
};

module.exports = buildOptions;
