const passportLogin = require('./localStrategy');
const googleLogin = require('./googleStrategy');
const githubLogin = require('./githubStrategy');
const discordLogin = require('./discordStrategy');
const twitterLogin = require('./twitterStrategy');
const jwtLogin = require('./jwtStrategy');
const facebookLogin = require('./facebookStrategy');
const setupOpenId = require('./openidStrategy');

module.exports = {
  passportLogin,
  googleLogin,
  githubLogin,
  discordLogin,
  twitterLogin,
  jwtLogin,
  facebookLogin,
  setupOpenId,
};
