const { configureTokenStore } = require('@librechat/api');
const { findToken, updateToken, createToken, deleteTokens } = require('~/models');

let configuredMethods = {
  findToken,
  updateToken,
  createToken,
  deleteTokens,
};

function initializeTokenStore(appConfig) {
  const tokenStoreConfig = appConfig?.config?.auth?.tokenStore;
  configuredMethods = configureTokenStore({
    config: tokenStoreConfig ?? null,
    defaultMethods: {
      findToken,
      updateToken,
      createToken,
      deleteTokens,
    },
  });
  return configuredMethods;
}

function getTokenStoreMethods() {
  return configuredMethods;
}

module.exports = {
  initializeTokenStore,
  getTokenStoreMethods,
};
