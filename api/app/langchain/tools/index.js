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
const StableDiffusionAPI = require('./stablediffusion');
const WolframAlphaAPI = require('./wolfram');
const availableTools = require('./manifest.json');

const validateTools = (tools) => {
  const validTools = new Set(availableTools.map((tool) => tool.pluginKey));

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

  return tools.filter((tool) => {
    if (!validTools.has(tool))
      console.log('Invalid tool, are your tool credentials set? tool: ', tool);
    return validTools.has(tool);
  });
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
  'stable-diffusion': () => new StableDiffusionAPI(),
  wolfram: () => new WolframAlphaAPI()
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
  SelfReflectionTool
};
