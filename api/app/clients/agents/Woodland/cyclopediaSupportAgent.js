const promptTemplates = require('./promptTemplates');
const createWoodlandFunctionsAgent = require('./createWoodlandFunctionsAgent');

const CYCLOPEDIA_HOSTS = [
  'https://cyclopedia.cyclonerake.com/',
  'https://cyclopedia.cyclonerake.com',
  'https://support.cyclonerake.com',
];

const INSTRUCTIONS = promptTemplates.cyclopediaSupport;

module.exports = async function initializeCyclopediaSupportAgent(params) {
  return createWoodlandFunctionsAgent(params, {
    agentName: 'CyclopediaSupportAgent',
    instructions: INSTRUCTIONS,
    allowedTools: ['woodland-ai-search-cyclopedia'],
    citationWhitelist: CYCLOPEDIA_HOSTS,
  });
};
