const abortMiddleware = require('./abortMiddleware');
const setHeaders = require('./setHeaders');
const loginLimiter = require('./loginLimiter');
const requireJwtAuth = require('./requireJwtAuth');
const registerLimiter = require('./registerLimiter');
const questionLimiter = require('./questionLimiter');
const requireLocalAuth = require('./requireLocalAuth');
const validateEndpoint = require('./validateEndpoint');
const validateMessageReq = require('./validateMessageReq');
const buildEndpointOption = require('./buildEndpointOption');
const validateRegistration = require('./validateRegistration');

module.exports = {
  ...abortMiddleware,
  setHeaders,
  loginLimiter,
  requireJwtAuth,
  registerLimiter,
  questionLimiter,
  requireLocalAuth,
  validateEndpoint,
  validateMessageReq,
  buildEndpointOption,
  validateRegistration,
};
