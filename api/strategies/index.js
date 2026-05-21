const passportLogin = require('./localStrategy');
const googleLogin = require('./googleStrategy');
const { googleAdminLogin } = googleLogin;
const githubLogin = require('./githubStrategy');
const { githubAdminLogin } = githubLogin;
const jwtLogin = require('./jwtStrategy');

module.exports = {
  passportLogin,
  googleLogin,
  googleAdminLogin,
  githubLogin,
  githubAdminLogin,
  jwtLogin,
};
