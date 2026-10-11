const express = require('express');
const {
  setOAuthSession,
  createProxyAwareFetch,
  createPullRequestOAuthFromEnv,
  createPullRequestConnectionHandlers,
} = require('@librechat/api');
const requireJwtAuth = require('~/server/middleware/requireJwtAuth');
const { getAppConfig } = require('~/server/services/Config');
const db = require('~/models');

const router = express.Router();
const oauth = createPullRequestOAuthFromEnv({
  store: db,
  fetchFn: createProxyAwareFetch(),
  env: process.env,
});

if (oauth) {
  const handlers = createPullRequestConnectionHandlers({ oauth, getAppConfig, env: process.env });
  router.get('/oauth/callback', handlers.callback);
  router.get('/oauth/connect', requireJwtAuth, setOAuthSession, handlers.connect);
  router.get('/oauth/status', requireJwtAuth, handlers.status);
  router.delete('/oauth', requireJwtAuth, handlers.disconnect);
}

module.exports = router;
