const passport = require('passport');
const logger = require('~/utils/logger');

const requireLdapAuth = (req, res, next) => {
  passport.authenticate('ldapauth', (err, user, info) => {
    if (err) {
      logger.info({
        title: '(requireLdapAuth) Error at passport.authenticate',
        parameters: [{ name: 'error', value: err }],
      });
      return next(err);
    }

    if (!user) {
      logger.info({
        title: '(requireLdapAuth) Error: No user',
      });
      return res.status(422).send(info);
    }
    req.user = user;
    next();
  })(req, res, next);
};
module.exports = requireLdapAuth;
