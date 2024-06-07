const createTTSLimiters = require('./ttsLimiters');
const createSTTLimiters = require('./sttLimiters');

const loginLimiter = require('./loginLimiter');
const importLimiters = require('./importLimiters');
const uploadLimiters = require('./uploadLimiters');
const registerLimiter = require('./registerLimiter');
const messageLimiters = require('./messageLimiters');

module.exports = {
  ...uploadLimiters,
  ...importLimiters,
  ...messageLimiters,
  loginLimiter,
  registerLimiter,
  createTTSLimiters,
  createSTTLimiters,
};
