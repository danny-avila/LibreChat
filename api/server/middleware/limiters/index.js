const createTTSLimiters = require('./ttsLimiters');
const createSTTLimiters = require('./sttLimiters');

const loginLimiter = require('./loginLimiter');
const importLimiters = require('./importLimiters');
const uploadLimiters = require('./uploadLimiters');
const forkLimiters = require('./forkLimiters');
const shareLimiters = require('./shareLimiters');
const accessLimiters = require('./accessLimiters');
const registerLimiter = require('./registerLimiter');
const toolCallLimiter = require('./toolCallLimiter');
const messageLimiters = require('./messageLimiters');
const promptUsageLimiter = require('./promptUsageLimiter');
const verifyEmailLimiter = require('./verifyEmailLimiter');
const resetPasswordLimiter = require('./resetPasswordLimiter');
const mcpOAuthLimiters = require('./mcpOAuthLimiters');

module.exports = {
  ...uploadLimiters,
  ...importLimiters,
  ...messageLimiters,
  ...forkLimiters,
  ...shareLimiters,
  ...accessLimiters,
  ...promptUsageLimiter,
  ...mcpOAuthLimiters,
  loginLimiter,
  registerLimiter,
  toolCallLimiter,
  createTTSLimiters,
  createSTTLimiters,
  verifyEmailLimiter,
  resetPasswordLimiter,
  verifyEmailSubmissionLimiter,
  resetPasswordSubmissionLimiter,
  twoFactorTempLimiter,
};
