const createTTSLimiters = require('./ttsLimiters');
const createSTTLimiters = require('./sttLimiters');

const loginLimiter = require('./loginLimiter');
const passkeyLimiter = require('./passkeyLimiter');
const importLimiters = require('./importLimiters');
const uploadLimiters = require('./uploadLimiters');
const forkLimiters = require('./forkLimiters');
const registerLimiter = require('./registerLimiter');
const toolCallLimiter = require('./toolCallLimiter');
const messageLimiters = require('./messageLimiters');
const promptUsageLimiter = require('./promptUsageLimiter');
const verifyEmailLimiter = require('./verifyEmailLimiter');
const resetPasswordLimiter = require('./resetPasswordLimiter');
const twoFactorTempLimiter = require('./twoFactorTempLimiter');
const passkeyStepUpLimiter = require('./passkeyStepUpLimiter');
const verifyEmailSubmissionLimiter = require('./verifyEmailSubmissionLimiter');
const resetPasswordSubmissionLimiter = require('./resetPasswordSubmissionLimiter');

module.exports = {
  ...uploadLimiters,
  ...importLimiters,
  ...messageLimiters,
  ...forkLimiters,
  ...promptUsageLimiter,
  loginLimiter,
  passkeyLimiter,
  passkeyStepUpLimiter,
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
