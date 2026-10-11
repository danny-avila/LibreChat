const { createProxyAwareFetch, createPullRequestConnectionRouter } = require('@librechat/api');
const requireJwtAuth = require('~/server/middleware/requireJwtAuth');
const { getAppConfig } = require('~/server/services/Config');
const db = require('~/models');

module.exports = createPullRequestConnectionRouter({
  store: db,
  fetchFn: createProxyAwareFetch(),
  env: process.env,
  getAppConfig,
  requireJwtAuth,
});
