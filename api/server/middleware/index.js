// api/server/middleware/index.js

// Authentication Middleware
const requireJwtAuth = require('./requireJwtAuth');
const requireLocalAuth = require('./requireLocalAuth');
const requireLdapAuth = require('./requireLdapAuth');

// Validation Middleware
const validatePasswordReset = require('./validatePasswordReset');
const validateRegistration = require('./validateRegistration');
const validateMessageReq = require('./validateMessageReq');
const validateEndpoint = require('./validateEndpoint');
const validateModel = require('./validateModel');

// Access and Security Middleware
const checkBan = require('./checkBan');
const canDeleteAccount = require('./canDeleteAccount');
const checkDomainAllowed = require('./checkDomainAllowed');
const checkInviteUser = require('./checkInviteUser');
const accessResources = require('./accessResources');
const moderateText = require('./moderateText');

// Rate Limiting and Concurrency
const concurrentLimiter = require('./concurrentLimiter');
const rateLimitMiddleware = require('./rateLimitMiddleware'); // From previous PR

// Request Handling Middleware
const abortMiddleware = require('./abortMiddleware');
const buildEndpointOption = require('./buildEndpointOption');
const logHeaders = require('./logHeaders');
const setHeaders = require('./setHeaders');
const uaParser = require('./uaParser');
const noIndex = require('./noIndex');

// Configuration and Roles
const configMiddleware = require('./config/app');
const roles = require('./roles');

// Load limiters (assumed to export an object or functions)
const limiters = require('./limiters');
const validate = require('./validate');

// Error handling for required modules
const loadModule = (modulePath, name) => {
  try {
    return require(modulePath);
  } catch (error) {
    console.error(`Failed to load middleware ${name}:`, error);
    throw new Error(`Middleware ${name} is unavailable`);
  }
};

// Export all middleware functions
module.exports = {
  // Authentication
  requireJwtAuth,
  requireLocalAuth,
  requireLdapAuth,

  // Validation
  validatePasswordReset,
  validateRegistration,
  validateMessageReq,
  validateEndpoint,
  validateModel,

  // Access and Security
  checkBan,
  canDeleteAccount,
  checkDomainAllowed,
  checkInviteUser,
  accessResources,
  moderateText,

  // Rate Limiting and Concurrency
  concurrentLimiter,
  rateLimitMiddleware,

  // Request Handling
  abortMiddleware,
  buildEndpointOption,
  logHeaders,
  setHeaders,
  uaParser,
  noIndex,

  // Configuration and Roles
  configMiddleware,
  roles,

  // Legacy/Object Exports (assuming these might export objects)
  ...limiters,
  ...validate,
};