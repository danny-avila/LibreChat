const buildOptions = (endpoint, parsedBody) => {
  const {
    chatGptLabel,
    promptPrefix,
    maxContextTokens,
    resendFiles = true,
    imageDetail,
    iconURL,
    greeting,
    spec,
    ...modelOptions
  } = parsedBody;
  const endpointOption = {
    endpoint,
    chatGptLabel,
    promptPrefix,
    resendFiles,
    imageDetail,
    iconURL,
    greeting,
    spec,
    maxContextTokens,
    modelOptions,
  };

  return endpointOption;
};

module.exports = buildOptions;
