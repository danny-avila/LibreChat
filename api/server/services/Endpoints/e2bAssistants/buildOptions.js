const { EModelEndpoint } = require('librechat-data-provider');

/**
 * 构建E2B Assistants端点选项
 * @param {string} endpoint 
 * @param {Object} parsedBody 
 * @param {string} endpointType 
 * @returns {Promise<Object>}
 */
async function buildOptions(endpoint, parsedBody, endpointType) {
  const { assistant_id, model, instructions, ...rest } = parsedBody;
  
  return {
    ...rest,
    endpoint: EModelEndpoint.e2bAssistants,
    endpointType: EModelEndpoint.e2bAssistants,
    assistant_id,
    model: model || 'gpt-4-turbo-preview',
    instructions,
  };
}

module.exports = {
  buildOptions,
};
