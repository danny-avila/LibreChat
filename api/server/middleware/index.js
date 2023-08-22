const abortMiddleware = require('./abortMiddleware');
const setHeaders = require('./setHeaders');
const requireJwtAuth = require('./requireJwtAuth');
const requireLocalAuth = require('./requireLocalAuth');
const validateEndpoint = require('./validateEndpoint');
const validateMessageReq = require('./validateMessageReq');
const buildEndpointOption = require('./buildEndpointOption');
const validateRegistration = require('./validateRegistration');

module.exports = {
  ...abortMiddleware,
  setHeaders,
  requireJwtAuth,
  requireLocalAuth,
  validateEndpoint,
  validateMessageReq,
  buildEndpointOption,
  validateRegistration,
};
