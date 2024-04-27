const abortMiddleware = require('./abortMiddleware');
const checkBan = require('./checkBan');
const checkDomainAllowed = require('./checkDomainAllowed');
const uaParser = require('./uaParser');
const setHeaders = require('./setHeaders');
const loginLimiter = require('./loginLimiter');
const validateModel = require('./validateModel');
const requireJwtAuth = require('./requireJwtAuth');
const uploadLimiters = require('./uploadLimiters');
const registerLimiter = require('./registerLimiter');
const messageLimiters = require('./messageLimiters');
const requireLocalAuth = require('./requireLocalAuth');
const validateEndpoint = require('./validateEndpoint');
const concurrentLimiter = require('./concurrentLimiter');
const validateMessageReq = require('./validateMessageReq');
const buildEndpointOption = require('./buildEndpointOption');
const validateRegistration = require('./validateRegistration');
const validateImageRequest = require('./validateImageRequest');
const moderateText = require('./moderateText');
const noIndex = require('./noIndex');

module.exports = {
  ...uploadLimiters,
  ...abortMiddleware,
  ...messageLimiters,
  checkBan,
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
  validateImageRequest,
  validateModel,
  moderateText,
  noIndex,
  checkDomainAllowed,
};
