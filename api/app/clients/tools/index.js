const availableTools = require('./manifest.json');
// Basic Tools
const CodeBrew = require('./CodeBrew');
const GoogleSearchAPI = require('./GoogleSearch');
const WolframAlphaAPI = require('./Wolfram');
const AzureAiSearch = require('./AzureAiSearch');
const OpenAICreateImage = require('./DALL-E');
const StableDiffusionAPI = require('./StableDiffusion');
const SelfReflectionTool = require('./SelfReflection');

// Structured Tools
const DALLE3 = require('./structured/DALLE3');
const ChatTool = require('./structured/ChatTool');
const E2BTools = require('./structured/E2BTools');
const CodeSherpa = require('./structured/CodeSherpa');
const StructuredSD = require('./structured/StableDiffusion');
const StructuredACS = require('./structured/AzureAISearch');
const CodeSherpaTools = require('./structured/CodeSherpaTools');
const StructuredWolfram = require('./structured/Wolfram');
const TavilySearchResults = require('./structured/TavilySearchResults');

module.exports = {
  availableTools,
  // Basic Tools
  CodeBrew,
  AzureAiSearch,
  GoogleSearchAPI,
  WolframAlphaAPI,
  OpenAICreateImage,
  StableDiffusionAPI,
  SelfReflectionTool,
  // Structured Tools
  DALLE3,
  ChatTool,
  E2BTools,
  CodeSherpa,
  StructuredSD,
  StructuredACS,
  CodeSherpaTools,
  StructuredWolfram,
  TavilySearchResults,
};
