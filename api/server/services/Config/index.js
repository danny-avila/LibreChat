const { config } = require('./EndpointService');
const loadDefaultModels = require('./loadDefaultModels');
const loadOverrideConfig = require('./loadOverrideConfig');
const loadAsyncEndpoints = require('./loadAsyncEndpoints');
const loadDefaultEndpointsConfig = require('./loadDefaultEConfig');

module.exports = {
  config,
  loadDefaultModels,
  loadOverrideConfig,
  loadAsyncEndpoints,
  loadDefaultEndpointsConfig,
};
