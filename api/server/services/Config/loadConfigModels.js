const { createLoadConfigModels, fetchModels, validateEndpointURL } = require('@librechat/api');
const { getAppConfig } = require('./app');
const db = require('~/models');

const loadConfigModels = createLoadConfigModels({
  getAppConfig,
  getUserKeyValues: db.getUserKeyValues,
  fetchModels,
  validateEndpointURL,
  includeOpenAICompatibleEndpoint: true,
});

module.exports = loadConfigModels;
