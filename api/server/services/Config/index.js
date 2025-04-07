const { config } = require('./EndpointService');
const getCustomConfig = require('./getCustomConfig');
const loadCustomConfig = require('./loadCustomConfig');
const loadConfigModels = require('./loadConfigModels');
const getEndpointsConfig = require('./getEndpointsConfig');
const loadOverrideConfig = require('./loadOverrideConfig');
const loadAsyncEndpoints = require('./loadAsyncEndpoints');

module.exports = {
  config,
  loadCustomConfig,
  loadConfigModels,
  loadOverrideConfig,
  loadAsyncEndpoints,
  ...getCustomConfig,
  ...getEndpointsConfig,
};
