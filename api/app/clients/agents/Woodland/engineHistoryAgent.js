const promptTemplates = require('./promptTemplates');
const createWoodlandFunctionsAgent = require('./createWoodlandFunctionsAgent');

const INSTRUCTIONS = promptTemplates.engineHistory;

module.exports = async function initializeEngineHistoryAgent(params) {
  return createWoodlandFunctionsAgent(params, {
    agentName: 'EngineHistoryAgent',
    instructions: INSTRUCTIONS,
    allowedTools: ['woodland-ai-engine-history'],
  });
};
