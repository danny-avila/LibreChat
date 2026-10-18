const { createLoginController, clearCloudFrontCookies } = require('@librechat/api');
const { setAuthTokens, issueAuthTokens } = require('~/server/services/AuthService');
const { deleteAllPrincipalSessions } = require('~/server/services/AuthSessions');
const { generate2FATempToken } = require('~/server/services/twoFactorService');
const { getUserById } = require('~/models');

const loginController = createLoginController({
  generate2FATempToken,
  getUserById,
  deleteAllUserSessions: deleteAllPrincipalSessions,
  setAuthTokens,
  issueAuthTokens,
  clearCloudFrontCookies,
});

module.exports = { loginController };
