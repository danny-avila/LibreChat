const promptTemplates = require('./promptTemplates');
const createWoodlandFunctionsAgent = require('./createWoodlandFunctionsAgent');

const INSTRUCTIONS = promptTemplates.productHistory;

module.exports = async function initializeProductHistoryAgent(params) {
  return createWoodlandFunctionsAgent(params, {
    agentName: 'ProductHistoryAgent',
    instructions: INSTRUCTIONS,
    allowedTools: ['woodland-ai-product-history'],
  });
};
