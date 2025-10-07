const promptTemplates = require('./promptTemplates');
const createWoodlandFunctionsAgent = require('./createWoodlandFunctionsAgent');

const INSTRUCTIONS = promptTemplates.catalogParts;

module.exports = async function initializeCatalogPartsAgent(params) {
  return createWoodlandFunctionsAgent(params, {
    agentName: 'CatalogPartsAgent',
    instructions: INSTRUCTIONS,
    allowedTools: ['woodland-ai-search-catalog'],
  });
};
