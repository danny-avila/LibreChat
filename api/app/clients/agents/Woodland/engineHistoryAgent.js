const promptTemplates = require('./promptTemplates');
const createWoodlandFunctionsAgent = require('./createWoodlandFunctionsAgent');
const WoodlandEngineHistory = require('../../tools/structured/WoodlandEngineHistory');

const INSTRUCTIONS = promptTemplates.engineHistory;

module.exports = async function initializeEngineHistoryAgent(params) {
  const providedTools = Array.isArray(params?.tools) ? params.tools : [];
  let tools = providedTools;
  if (!providedTools.length) {
    try {
      tools = [new WoodlandEngineHistory({})];
    } catch (_) {
      tools = providedTools;
    }
  }

  return createWoodlandFunctionsAgent({ ...(params || {}), tools }, {
    agentName: 'EngineHistoryAgent',
    instructions: INSTRUCTIONS,
    allowedTools: ['woodland-ai-engine-history'],
  });
};
