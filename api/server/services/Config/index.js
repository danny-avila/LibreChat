const { config } = require('./EndpointService');
const loadDefaultEndpointsConfig = require('./loadDefaultEConfig');
const loadDefaultModels = require('./loadDefaultModels');
const loadAsyncEndpoints = require('./loadAsyncEndpoints');

module.exports = {
  config,
  loadDefaultEndpointsConfig,
  loadDefaultModels,
  loadAsyncEndpoints,
};
