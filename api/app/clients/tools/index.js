const manifest = require('./manifest');

// Structured Tools
const DALLE3 = require('./structured/DALLE3');
const FluxAPI = require('./structured/FluxAPI');
const OpenWeather = require('./structured/OpenWeather');
const StructuredWolfram = require('./structured/Wolfram');
const StructuredACS = require('./structured/AzureAISearch');
const StructuredSD = require('./structured/StableDiffusion');
const GoogleSearchAPI = require('./structured/GoogleSearch');
const TraversaalSearch = require('./structured/TraversaalSearch');
const createOpenAIImageTools = require('./structured/OpenAIImageTools');
const TavilySearchResults = require('./structured/TavilySearchResults');
const createGeminiImageTool = require('./structured/GeminiImageGen');

// Woodland Tools
const StructuredWPPACSCatalog = require('./structured/WoodlandAISearchCatalog');
const StructuredWPPACSCyclopedia = require('./structured/WoodlandAISearchCyclopedia');
const StructuredWPPACSWebsite = require('./structured/WoodlandAISearchWebsite');
const StructuredWPPACSTractor = require('./structured/WoodlandAISearchTractor');
const StructuredWPPACSCases = require('./structured/WoodlandAISearchCases');
const StructuredWoodlandAIEngineHistory = require('./structured/WoodlandEngineHistory');
const StructuredWoodlandAIProductHistory = require('./structured/WoodlandProductHistory');

module.exports = {
  ...manifest,
  // Structured Tools
  DALLE3,
  FluxAPI,
  OpenWeather,
  StructuredSD,
  StructuredACS,
  GoogleSearchAPI,
  TraversaalSearch,
  StructuredWolfram,
  TavilySearchResults,
  createOpenAIImageTools,
  createGeminiImageTool,
  // Woodland Tools
  StructuredWPPACSCatalog,
  StructuredWPPACSCyclopedia,
  StructuredWPPACSWebsite,
  StructuredWPPACSTractor,
  StructuredWPPACSCases,
  StructuredWoodlandAIEngineHistory,
  StructuredWoodlandAIProductHistory,
};
