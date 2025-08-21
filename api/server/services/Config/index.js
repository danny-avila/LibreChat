const { config } = require('./EndpointService');
const getCachedTools = require('./getCachedTools');
const getCustomConfig = require('./getCustomConfig');
const mcpToolsCache = require('./mcpToolsCache');
const loadCustomConfig = require('./loadCustomConfig');
const loadConfigModels = require('./loadConfigModels');
const loadDefaultModels = require('./loadDefaultModels');
const getEndpointsConfig = require('./getEndpointsConfig');
const loadOverrideConfig = require('./loadOverrideConfig');
const loadAsyncEndpoints = require('./loadAsyncEndpoints');

module.exports = {
  config,
  loadCustomConfig,
  loadConfigModels,
  loadDefaultModels,
  loadOverrideConfig,
  loadAsyncEndpoints,
  ...getCachedTools,
  ...getCustomConfig,
  ...mcpToolsCache,
  ...getEndpointsConfig,
};
