const manifest = require('./manifest');

// Structured Tools
const DALLE3 = require('./structured/DALLE3');
const FluxAPI = require('./structured/FluxAPI');
const OpenWeather = require('./structured/OpenWeather');
const StructuredWolfram = require('./structured/Wolfram');
const createYouTubeTools = require('./structured/YouTube');
const StructuredACS = require('./structured/AzureAISearch');
const StructuredSD = require('./structured/StableDiffusion');
const GoogleSearchAPI = require('./structured/GoogleSearch');
const TraversaalSearch = require('./structured/TraversaalSearch');
const createOpenAIImageTools = require('./structured/OpenAIImageTools');
const TavilySearchResults = require('./structured/TavilySearchResults');
const StructuredWPPACS = require('./structured/WoodlandAISearch');
const StructuredWPPACSTractor = require('./structured/WoodlandAISearchTractor');
const StructuredWPPACSCases = require('./structured/WoodlandAISearchCases');
const StructuredWPPACSAll = require('./structured/WoodlandAISearchAll');
const StructuredWPPACSGeneral = require('./structured/WoodlandAISearchGeneral');

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
  createYouTubeTools,
  TavilySearchResults,
  createOpenAIImageTools,
  StructuredWPPACS,
  StructuredWPPACSTractor,
  StructuredWPPACSCases,
  StructuredWPPACSAll
  ,StructuredWPPACSGeneral
};
