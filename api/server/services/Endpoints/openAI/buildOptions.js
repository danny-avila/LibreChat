const buildOptions = (endpoint, parsedBody) => {
  const { chatGptLabel, promptPrefix, resendImages, imageDetail, ...rest } = parsedBody;
  const endpointOption = {
    endpoint,
    chatGptLabel,
    promptPrefix,
    resendImages,
    imageDetail,
    modelOptions: {
      ...rest,
    },
  };

  return endpointOption;
};

module.exports = buildOptions;
