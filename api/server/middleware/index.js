const validatePasswordReset = require('./validatePasswordReset');
const validateRegistration = require('./validateRegistration');
const validateImageRequest = require('./validateImageRequest');
const buildEndpointOption = require('./buildEndpointOption');
const validateMessageReq = require('./validateMessageReq');
const checkDomainAllowed = require('./checkDomainAllowed');
const concurrentLimiter = require('./concurrentLimiter');
const validateEndpoint = require('./validateEndpoint');
const requireLocalAuth = require('./requireLocalAuth');
const canDeleteAccount = require('./canDeleteAccount');
const requireLdapAuth = require('./requireLdapAuth');
const abortMiddleware = require('./abortMiddleware');
const requireJwtAuth = require('./requireJwtAuth');
const validateModel = require('./validateModel');
const moderateText = require('./moderateText');
const setHeaders = require('./setHeaders');
const validate = require('./validate');
const limiters = require('./limiters');
const uaParser = require('./uaParser');
const checkBan = require('./checkBan');
const noIndex = require('./noIndex');
const roles = require('./roles');

module.exports = {
  ...abortMiddleware,
  ...validate,
  ...limiters,
  ...roles,
  noIndex,
  checkBan,
  uaParser,
  setHeaders,
  moderateText,
  validateModel,
  requireJwtAuth,
  requireLdapAuth,
  requireLocalAuth,
  canDeleteAccount,
  validateEndpoint,
  concurrentLimiter,
  checkDomainAllowed,
  validateMessageReq,
  buildEndpointOption,
  validateRegistration,
  validateImageRequest,
  validatePasswordReset,
};
