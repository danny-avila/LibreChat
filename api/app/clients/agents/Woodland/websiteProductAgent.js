const promptTemplates = require('./promptTemplates');
const createWoodlandFunctionsAgent = require('./createWoodlandFunctionsAgent');
const WoodlandAISearchWebsite = require('../../tools/structured/WoodlandAISearchWebsite');

const WEBSITE_HOSTS = ['https://cyclonerake.com', 'https://www.cyclonerake.com'];

const INSTRUCTIONS = promptTemplates.websiteProduct;

module.exports = async function initializeWebsiteProductAgent(params) {
  const providedTools = Array.isArray(params?.tools) ? params.tools : [];
  let tools = providedTools;
  if (!providedTools.length) {
    try {
      tools = [new WoodlandAISearchWebsite({})];
    } catch (_) {
      tools = providedTools;
    }
  }

  return createWoodlandFunctionsAgent({ ...(params || {}), tools }, {
    agentName: 'WebsiteProductAgent',
    instructions: INSTRUCTIONS,
    allowedTools: ['woodland-ai-search-website'],
    citationWhitelist: WEBSITE_HOSTS,
  });
};
