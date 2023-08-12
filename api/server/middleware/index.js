const setHeaders = require('./setHeaders');
const abortMiddleware = require('./abortMiddleware');
const requireJwtAuth = require('./requireJwtAuth');
const requireLocalAuth = require('./requireLocalAuth');

module.exports = {
  ...abortMiddleware,
  requireJwtAuth,
  requireLocalAuth,
  setHeaders,
};
