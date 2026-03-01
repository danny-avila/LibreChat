const promptTemplates = require('./promptTemplates');
const createWoodlandFunctionsAgent = require('./createWoodlandFunctionsAgent');
const WoodlandAISearchTractor = require('../../tools/structured/WoodlandAISearchTractor');

const INSTRUCTIONS = promptTemplates.tractorFitment;

module.exports = async function initializeTractorFitmentAgent(params) {
  const providedTools = Array.isArray(params?.tools) ? params.tools : [];
  let tools = providedTools;
  if (!providedTools.length) {
    try {
      tools = [new WoodlandAISearchTractor({})];
    } catch (_) {
      tools = providedTools;
    }
  }

  return createWoodlandFunctionsAgent({ ...(params || {}), tools }, {
    agentName: 'TractorFitmentAgent',
    instructions: INSTRUCTIONS,
    allowedTools: ['woodland-ai-search-tractor'],
  });
};
