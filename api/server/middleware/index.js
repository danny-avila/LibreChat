const abortMiddleware = require('./abortMiddleware');
const uaParser = require('./uaParser');
const setHeaders = require('./setHeaders');
const loginLimiter = require('./loginLimiter');
const requireJwtAuth = require('./requireJwtAuth');
const registerLimiter = require('./registerLimiter');
const messageLimiters = require('./messageLimiters');
const requireLocalAuth = require('./requireLocalAuth');
const validateEndpoint = require('./validateEndpoint');
const concurrentLimiter = require('./concurrentLimiter');
const validateMessageReq = require('./validateMessageReq');
const buildEndpointOption = require('./buildEndpointOption');
const validateRegistration = require('./validateRegistration');

module.exports = {
  ...abortMiddleware,
  ...messageLimiters,
  uaParser,
  setHeaders,
  loginLimiter,
  requireJwtAuth,
  registerLimiter,
  requireLocalAuth,
  validateEndpoint,
  concurrentLimiter,
  validateMessageReq,
  buildEndpointOption,
  validateRegistration,
};
