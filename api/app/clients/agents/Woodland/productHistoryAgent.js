const promptTemplates = require('./promptTemplates');
const createWoodlandFunctionsAgent = require('./createWoodlandFunctionsAgent');
const WoodlandProductHistory = require('../../tools/structured/WoodlandProductHistory');

const INSTRUCTIONS = promptTemplates.productHistory;

module.exports = async function initializeProductHistoryAgent(params) {
  const providedTools = Array.isArray(params?.tools) ? params.tools : [];
  let tools = providedTools;
  if (!providedTools.length) {
    try {
      tools = [new WoodlandProductHistory({})];
    } catch (_) {
      tools = providedTools;
    }
  }

  return createWoodlandFunctionsAgent({ ...(params || {}), tools }, {
    agentName: 'ProductHistoryAgent',
    instructions: INSTRUCTIONS,
    allowedTools: ['woodland-ai-product-history'],
  });
};
