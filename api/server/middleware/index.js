const abortMiddleware = require('./abortMiddleware');
const checkBan = require('./checkBan');
const uaParser = require('./uaParser');
const setHeaders = require('./setHeaders');
const validateModel = require('./validateModel');
const uploadLimiters = require('./uploadLimiters');
const messageLimiters = require('./messageLimiters');
const validateEndpoint = require('./validateEndpoint');
const concurrentLimiter = require('./concurrentLimiter');
const validateMessageReq = require('./validateMessageReq');
const buildEndpointOption = require('./buildEndpointOption');
const moderateText = require('./moderateText');
const noIndex = require('./noIndex');
const setCurrentUser = require('./setCurrentUser');
const requireSubscription = require('./requireSubscription');

module.exports = {
  ...uploadLimiters,
  ...abortMiddleware,
  ...messageLimiters,
  checkBan,
  uaParser,
  setHeaders,
  validateEndpoint,
  concurrentLimiter,
  validateMessageReq,
  buildEndpointOption,
  validateModel,
  moderateText,
  noIndex,
  setCurrentUser,
  requireSubscription,
};
