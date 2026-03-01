const promptTemplates = require('./promptTemplates');
const createWoodlandFunctionsAgent = require('./createWoodlandFunctionsAgent');
const WoodlandAISearchCases = require('../../tools/structured/WoodlandAISearchCases');

const INSTRUCTIONS = promptTemplates.casesReference;

module.exports = async function initializeCasesReferenceAgent(params) {
  const providedTools = Array.isArray(params?.tools) ? params.tools : [];
  let tools = providedTools;
  if (!providedTools.length) {
    try {
      tools = [new WoodlandAISearchCases({})];
    } catch (_) {
      tools = providedTools;
    }
  }

  return createWoodlandFunctionsAgent({ ...(params || {}), tools }, {
    agentName: 'CasesReferenceAgent',
    instructions: INSTRUCTIONS,
    allowedTools: tools.length ? undefined : ['woodland-ai-search-cases'],
  });
};
