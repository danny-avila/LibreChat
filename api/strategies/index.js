const { setupOpenId, getOpenIdConfig } = require('./openidStrategy');
const openIdJwtLogin = require('./openIdJwtStrategy');
const facebookLogin = require('./facebookStrategy');
const discordLogin = require('./discordStrategy');
const passportLogin = require('./localStrategy');
const googleLogin = require('./googleStrategy');
const githubLogin = require('./githubStrategy');
const { setupSaml } = require('./samlStrategy');
const appleLogin = require('./appleStrategy');
const ldapLogin = require('./ldapStrategy');
const jwtLogin = require('./jwtStrategy');

module.exports = {
  appleLogin,
  passportLogin,
  googleLogin,
  githubLogin,
  discordLogin,
  jwtLogin,
  facebookLogin,
  setupOpenId,
  getOpenIdConfig,
  ldapLogin,
  setupSaml,
  openIdJwtLogin,
};
