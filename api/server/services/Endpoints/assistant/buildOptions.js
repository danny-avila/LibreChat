const buildOptions = (endpoint, parsedBody) => {
  // eslint-disable-next-line no-unused-vars
  const { promptPrefix, chatGptLabel, resendImages, imageDetail, ...rest } = parsedBody;
  const endpointOption = {
    endpoint,
    promptPrefix,
    modelOptions: {
      ...rest,
    },
  };

  return endpointOption;
};

module.exports = buildOptions;
