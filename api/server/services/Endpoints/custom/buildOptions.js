const buildOptions = (endpoint, parsedBody, endpointType) => {
  const { chatGptLabel, promptPrefix, resendImages, imageDetail, ...rest } = parsedBody;
  const endpointOption = {
    endpoint,
    endpointType,
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
