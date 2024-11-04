const { config } = require('./EndpointService');
const getCustomConfig = require('./getCustomConfig');
const loadCustomConfig = require('./loadCustomConfig');
const loadConfigModels = require('./loadConfigModels');
const loadDefaultModels = require('./loadDefaultModels');
const loadOverrideConfig = require('./loadOverrideConfig');
const loadAsyncEndpoints = require('./loadAsyncEndpoints');
const loadConfigEndpoints = require('./loadConfigEndpoints');
const loadDefaultEndpointsConfig = require('./loadDefaultEConfig');

module.exports = {
  config,
  loadCustomConfig,
  loadConfigModels,
  loadDefaultModels,
  loadOverrideConfig,
  loadAsyncEndpoints,
  ...getCustomConfig,
  loadConfigEndpoints,
  loadDefaultEndpointsConfig,
};
