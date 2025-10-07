const promptTemplates = require('./promptTemplates');
const createWoodlandFunctionsAgent = require('./createWoodlandFunctionsAgent');

const INSTRUCTIONS = promptTemplates.casesReference;

module.exports = async function initializeCasesReferenceAgent(params) {
  return createWoodlandFunctionsAgent(params, {
    agentName: 'CasesReferenceAgent',
    instructions: INSTRUCTIONS,
    allowedTools: params?.tools?.length ? undefined : ['woodland-ai-search-cases'],
  });
};
