const validatePasswordReset = require('./validatePasswordReset');
const validateRegistration = require('./validateRegistration');
const buildEndpointOption = require('./buildEndpointOption');
const validateMessageReq = require('./validateMessageReq');
const checkDomainAllowed = require('./checkDomainAllowed');
const concurrentLimiter = require('./concurrentLimiter');
const validateEndpoint = require('./validateEndpoint');
const requireLocalAuth = require('./requireLocalAuth');
const canDeleteAccount = require('./canDeleteAccount');
const accessResources = require('./accessResources');
const requireLdapAuth = require('./requireLdapAuth');
const abortMiddleware = require('./abortMiddleware');
const checkInviteUser = require('./checkInviteUser');
const requireJwtAuth = require('./requireJwtAuth');
const configMiddleware = require('./config/app');
const validateModel = require('./validateModel');
const moderateText = require('./moderateText');
const logHeaders = require('./logHeaders');
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
  ...accessResources,
  noIndex,
  checkBan,
  uaParser,
  setHeaders,
  logHeaders,
  moderateText,
  validateModel,
  requireJwtAuth,
  checkInviteUser,
  requireLdapAuth,
  requireLocalAuth,
  canDeleteAccount,
  validateEndpoint,
  configMiddleware,
  concurrentLimiter,
  checkDomainAllowed,
  validateMessageReq,
  buildEndpointOption,
  validateRegistration,
  validatePasswordReset,
};
