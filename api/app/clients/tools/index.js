const availableTools = require('./manifest.json');
// Basic Tools
const WolframAlphaAPI = require('./Wolfram');
const AzureAiSearch = require('./AzureAiSearch');
const OpenAICreateImage = require('./DALL-E');
const StableDiffusionAPI = require('./StableDiffusion');
const SelfReflectionTool = require('./SelfReflection');

// Structured Tools
const DALLE3 = require('./structured/DALLE3');
const StructuredSD = require('./structured/StableDiffusion');
const StructuredACS = require('./structured/AzureAISearch');
const GoogleSearchAPI = require('./structured/GoogleSearch');
const StructuredWolfram = require('./structured/Wolfram');
const TavilySearchResults = require('./structured/TavilySearchResults');
const TraversaalSearch = require('./structured/TraversaalSearch');

module.exports = {
  availableTools,
  // Basic Tools
  AzureAiSearch,
  WolframAlphaAPI,
  OpenAICreateImage,
  StableDiffusionAPI,
  SelfReflectionTool,
  // Structured Tools
  DALLE3,
  StructuredSD,
  StructuredACS,
  GoogleSearchAPI,
  TraversaalSearch,
  StructuredWolfram,
  TavilySearchResults,
};
