const buildOptions = (endpoint, parsedBody, endpointType) => {
  const { chatGptLabel, promptPrefix, resendFiles, imageDetail, iconURL, greeting, spec, ...rest } =
    parsedBody;
  const endpointOption = {
    endpoint,
    endpointType,
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
