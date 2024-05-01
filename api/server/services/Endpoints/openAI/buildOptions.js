const buildOptions = (endpoint, parsedBody) => {
  const { chatGptLabel, promptPrefix, resendFiles, imageDetail, iconURL, greeting, spec, ...rest } =
    parsedBody;
  const endpointOption = {
    endpoint,
    chatGptLabel,
    promptPrefix,
    resendFiles,
    imageDetail,
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
