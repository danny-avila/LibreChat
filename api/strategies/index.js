const appleLogin = require('./appleStrategy');
const passportLogin = require('./localStrategy');
const googleLogin = require('./googleStrategy');
const githubLogin = require('./githubStrategy');
const githubEnterpriseLogin = require('./githubEnterpriseStrategy');
const discordLogin = require('./discordStrategy');
const facebookLogin = require('./facebookStrategy');
const setupOpenId = require('./openidStrategy');
const jwtLogin = require('./jwtStrategy');
const ldapLogin = require('./ldapStrategy');

module.exports = {
  appleLogin,
  passportLogin,
  googleLogin,
  githubLogin,
  githubEnterpriseLogin,
  discordLogin,
  jwtLogin,
  facebookLogin,
  setupOpenId,
  ldapLogin,
};