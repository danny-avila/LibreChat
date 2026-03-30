const { setupOpenId, getOpenIdConfig, getOpenIdEmail } = require('./openidStrategy');
const openIdJwtLogin = require('./openIdJwtStrategy');
const facebookLogin = require('./facebookStrategy');
const { facebookAdminLogin } = require('./facebookStrategy');
const discordLogin = require('./discordStrategy');
const { discordAdminLogin } = require('./discordStrategy');
const passportLogin = require('./localStrategy');
const googleLogin = require('./googleStrategy');
const { googleAdminLogin } = require('./googleStrategy');
const githubLogin = require('./githubStrategy');
const { githubAdminLogin } = require('./githubStrategy');
const { setupSaml } = require('./samlStrategy');
const appleLogin = require('./appleStrategy');
const { appleAdminLogin } = require('./appleStrategy');
const ldapLogin = require('./ldapStrategy');
const jwtLogin = require('./jwtStrategy');

module.exports = {
  appleLogin,
  appleAdminLogin,
  passportLogin,
  googleLogin,
  googleAdminLogin,
  githubLogin,
  githubAdminLogin,
  discordLogin,
  discordAdminLogin,
  jwtLogin,
  facebookLogin,
  facebookAdminLogin,
  setupOpenId,
  getOpenIdConfig,
  getOpenIdEmail,
  ldapLogin,
  setupSaml,
  openIdJwtLogin,
};
