const GoogleSearchAPI = require('./GoogleSearch');
const OpenAICreateImage = require('./DALL-E');
const DALLE3 = require('./structured/DALLE3');
const StructuredSD = require('./structured/StableDiffusion');
const StableDiffusionAPI = require('./StableDiffusion');
const WolframAlphaAPI = require('./Wolfram');
const StructuredWolfram = require('./structured/Wolfram');
const SelfReflectionTool = require('./SelfReflection');
const AzureAiSearch = require('./AzureAiSearch');
const StructuredACS = require('./structured/AzureAISearch');
const ChatTool = require('./structured/ChatTool');
const E2BTools = require('./structured/E2BTools');
const CodeSherpa = require('./structured/CodeSherpa');
const CodeSherpaTools = require('./structured/CodeSherpaTools');
const availableTools = require('./manifest.json');
const CodeBrew = require('./CodeBrew');

module.exports = {
  availableTools,
  GoogleSearchAPI,
  OpenAICreateImage,
  DALLE3,
  StableDiffusionAPI,
  StructuredSD,
  WolframAlphaAPI,
  StructuredWolfram,
  SelfReflectionTool,
  AzureAiSearch,
  StructuredACS,
  E2BTools,
  ChatTool,
  CodeSherpa,
  CodeSherpaTools,
  CodeBrew,
};
