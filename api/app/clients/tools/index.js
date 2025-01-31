const availableTools = require('./manifest.json');

// Structured Tools
const DALLE3 = require('./structured/DALLE3');
const OpenWeather = require('./structured/OpenWeather');
const createYouTubeTools = require('./structured/YouTube');
const StructuredWolfram = require('./structured/Wolfram');
const StructuredACS = require('./structured/AzureAISearch');
const StructuredSD = require('./structured/StableDiffusion');
const GoogleSearchAPI = require('./structured/GoogleSearch');
const TraversaalSearch = require('./structured/TraversaalSearch');
const TavilySearchResults = require('./structured/TavilySearchResults');

/** @type {Record<string, TPlugin | undefined>} */
const manifestToolMap = {};

availableTools.forEach((tool) => {
  manifestToolMap[tool.pluginKey] = tool;
});

module.exports = {
  availableTools,
  manifestToolMap,
  // Structured Tools
  DALLE3,
  OpenWeather,
  StructuredSD,
  StructuredACS,
  GoogleSearchAPI,
  TraversaalSearch,
  StructuredWolfram,
  createYouTubeTools,
  TavilySearchResults,
};
