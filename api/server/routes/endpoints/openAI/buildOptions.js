const { parseConvo } = require('librechat-data-provider');
const { handleError } = require('../../../utils');

const buildOptions = (req, res) => {
  const { endpoint, text, parentMessageId, conversationId } = req.body;
  if (text.length === 0) {
    return handleError(res, { text: 'Prompt empty or too short' });
  }
  const isOpenAI = endpoint === 'openAI' || endpoint === 'azureOpenAI';
  if (!isOpenAI) {
    return handleError(res, { text: 'Illegal request' });
  }

  // build endpoint option
  const parsedBody = parseConvo(endpoint, req.body);
  const { chatGptLabel, promptPrefix, ...rest } = parsedBody;
  const endpointOption = {
    endpoint,
    chatGptLabel,
    promptPrefix,
    modelOptions: {
      ...rest,
    },
  };

  console.log('ask log');
  console.dir({ text, conversationId, endpointOption }, { depth: null });

  return { text, endpointOption, conversationId, parentMessageId };
};

module.exports = buildOptions;
