const buildOptions = (endpoint, parsedBody) => {
  const { chatGptLabel, promptPrefix, resendFiles, imageDetail, ...rest } = parsedBody;
  const endpointOption = {
    endpoint,
    chatGptLabel,
    promptPrefix,
    resendFiles,
    imageDetail,
    modelOptions: {
      ...rest,
    },
  };

  return endpointOption;
};

module.exports = buildOptions;
