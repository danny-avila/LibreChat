const promptTemplates = require('./promptTemplates');
const createWoodlandFunctionsAgent = require('./createWoodlandFunctionsAgent');

const INSTRUCTIONS = promptTemplates.tractorFitment;

module.exports = async function initializeTractorFitmentAgent(params) {
  return createWoodlandFunctionsAgent(params, {
    agentName: 'TractorFitmentAgent',
    instructions: INSTRUCTIONS,
    allowedTools: ['woodland-ai-search-tractor'],
  });
};
