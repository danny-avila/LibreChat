const openIdClient = require('openid-client');
const {
  createHostUpstreamTokenProviderResolver,
  persistUnattendedOpenIDTokens,
} = require('@librechat/api');

function buildDeps() {
  const methods = require('~/models');
  const { getAppConfig } = require('~/server/services/Config/app');
  const { getOpenIdConfig } = require('~/strategies/openidStrategy');
  return {
    findToken: methods.findToken,
    updateToken: methods.updateToken,
    createToken: methods.createToken,
    deleteTokens: methods.deleteTokens,
    getAppConfig,
    getOpenIdConfig,
    refreshTokenGrant: openIdClient.refreshTokenGrant,
  };
}

let resolver;

function getResolver() {
  resolver ??= createHostUpstreamTokenProviderResolver(buildDeps());
  return resolver;
}

function resolveUpstreamTokenProvider(user, options) {
  return getResolver()(user, options);
}

function persistOpenIDTokens(user, tokens) {
  return persistUnattendedOpenIDTokens(buildDeps(), user, tokens);
}

module.exports = {
  resolveUpstreamTokenProvider,
  persistOpenIDTokens,
};
