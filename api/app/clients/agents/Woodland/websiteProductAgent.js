const promptTemplates = require('./promptTemplates');
const createWoodlandFunctionsAgent = require('./createWoodlandFunctionsAgent');

const WEBSITE_HOSTS = ['https://cyclonerake.com', 'https://www.cyclonerake.com'];

const INSTRUCTIONS = promptTemplates.websiteProduct;

module.exports = async function initializeWebsiteProductAgent(params) {
  return createWoodlandFunctionsAgent(params, {
    agentName: 'WebsiteProductAgent',
    instructions: INSTRUCTIONS,
    allowedTools: ['woodland-ai-search-website'],
    citationWhitelist: WEBSITE_HOSTS,
  });
};
