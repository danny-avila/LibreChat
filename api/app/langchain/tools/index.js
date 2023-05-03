const { OpenAIEmbeddings } = require('langchain/embeddings/openai');
const { ZapierToolKit } = require('langchain/agents');
const {
  SerpAPI,
  ZapierNLAWrapper
  // RequestsGetTool,
  // RequestsPostTool,
  // AIPluginTool
} = require('langchain/tools');
const { Calculator } = require('langchain/tools/calculator');
const { WebBrowser } = require('langchain/tools/webbrowser');
const GoogleSearchAPI = require('./googleSearch');
const SelfReflectionTool = require('./selfReflection');
const OpenAICreateImage = require('./openaiCreateImage');
const WolframAlphaAPI = require('./wolfram');
const availableTools = [
  {
    name: 'Wolfram',
    value: 'wolfram',
    icon: 'https://www.wolframcdn.com/images/icons/Wolfram.png',
  },
  {
    name: 'Calculator',
    value: 'calculator',
    icon: null,
  },
  {
    name: 'Google',
    value: 'google',
    icon: null,
  },
  {
    name: 'Browser',
    value: 'browser',
    icon: null,
  },
  {
    name: 'Serpapi',
    value: 'serpapi',
    icon: null,
  },
  {
    name: 'DALL-E',
    value: 'dall-e',
    icon: null,
  },
  {
    name: 'Zapier',
    value: 'zapier',
    icon: 'https://cdn.zappy.app/8f853364f9b383d65b44e184e04689ed.png',
  },
];

const validateTools = (tools) => {
  const validTools = new Set(availableTools.map((tool) => tool.name)); // removed 'plugins'

  const validateAPIKey = (apiKeyName, toolName) => {
    if (!process.env[apiKeyName] || process.env[apiKeyName] === '') {
      validTools.delete(toolName);
    }
  };

  validateAPIKey('SERPAPI_API_KEY', 'serpapi');
  validateAPIKey('ZAPIER_NLA_API_KEY', 'zapier');
  validateAPIKey('GOOGLE_CSE_ID', 'google');
  validateAPIKey('GOOGLE_API_KEY', 'google');
  validateAPIKey('WOLFRAM_APP_ID', 'wolfram');

  // console.log('Valid tools:', validTools);
  return tools.filter((tool) => validTools.has(tool));
};

const loadTools = ({ model }) => ({
  calculator: () => new Calculator(),
  google: () => new GoogleSearchAPI(),
  browser: () => new WebBrowser({ model, embeddings: new OpenAIEmbeddings() }),
  serpapi: () =>
    new SerpAPI(process.env.SERPAPI_API_KEY || '', {
      location: 'Austin,Texas,United States',
      hl: 'en',
      gl: 'us'
    }),
  zapier: () => {
    const zapier = new ZapierNLAWrapper({
      apiKey: process.env.ZAPIER_NLA_API_KEY || ''
    });

    return ZapierToolKit.fromZapierNLAWrapper(zapier);
  },
  'dall-e': () => new OpenAICreateImage(),
  'wolfram': () => new WolframAlphaAPI(),
  // plugins: async () => {
  //   return [
  //     new RequestsGetTool(),
  //     new RequestsPostTool(),
  //     await AIPluginTool.fromPluginUrl('https://www.wolframalpha.com/.well-known/ai-plugin.json')
  //   ];
  // }
});

module.exports = {
  validateTools,
  availableTools,
  loadTools,
  SelfReflectionTool,
};
