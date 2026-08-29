const jwt = require('jsonwebtoken');
const api = require('@librechat/api');
const { logger } = require('@librechat/data-schemas');
const { findUser } = require('~/models');
const { getOpenIdConfig, getOpenIdEmail } = require('~/strategies');
const { setOpenIDAuthTokens, storeOpenIDSession } = require('./AuthService');
const bridge = require('./RefreshTokenBridge');
const flight = require('./OpenIDRefreshFlight');
const { refreshOpenIDSession } = require('./OpenIDSessionRefresh');

module.exports = api.createOpenIDRefreshRecoveryService({
  jwt,
  logger,
  findOpenIDUser: api.findOpenIDUser,
  findUser,
  getOpenIdConfig,
  getOpenIdEmail,
  getOpenIdIssuer: api.getOpenIdIssuer,
  createAuthIdentityContext: api.createAuthIdentityContext,
  refreshOpenIDSession,
  storeOpenIDSession,
  setOpenIDAuthTokens,
  createRefreshTokenBridgeFlightKey: bridge.createRefreshTokenBridgeFlightKey,
  storeRefreshTokenBridge: bridge.storeRefreshTokenBridge,
  acquireOpenIDRefreshFlight: flight.acquireOpenIDRefreshFlight,
  completeOpenIDRefreshFlight: flight.completeOpenIDRefreshFlight,
  failOpenIDRefreshFlight: flight.failOpenIDRefreshFlight,
  waitForOpenIDRefreshFlight: flight.waitForOpenIDRefreshFlight,
  withOpenIDRefreshFlightLease: flight.withOpenIDRefreshFlightLease,
  bridgeGraceMs: bridge.OPENID_REFRESH_BRIDGE_GRACE_MS,
});
