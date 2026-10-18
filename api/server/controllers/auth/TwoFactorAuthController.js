const { createEnrollmentControllers, clearCloudFrontCookies } = require('@librechat/api');
const {
  verifyTOTP,
  getTOTPSecret,
  verifyBackupCode,
  generateBackupCodes,
} = require('~/server/services/twoFactorService');
const { setAuthTokens, issueAuthTokens } = require('~/server/services/AuthService');
const { deleteAllPrincipalSessions } = require('~/server/services/AuthSessions');
const { getUserById, updateTwoFactorEnrollment } = require('~/models');

module.exports = createEnrollmentControllers({
  getUserById,
  getTOTPSecret,
  verifyTOTP,
  verifyBackupCode,
  generateBackupCodes,
  updateTwoFactorEnrollment,
  deleteAllUserSessions: deleteAllPrincipalSessions,
  setAuthTokens,
  issueAuthTokens,
  clearCloudFrontCookies,
});
