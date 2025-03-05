const passport = require('passport');
const { logger } = require('~/config');

const requireLocalAuth = (req, res, next) => {
  passport.authenticate('local', (err, user, info) => {
    if (err) {
      logger.debug('EXECUTING: (requireLocalAuth) Error at passport.authenticate');
      logger.debug('error:', err);
      return next(err);
    }
    if (!user) {
      logger.debug('EXECUTING: (requireLocalAuth) Error: No user');
      return res.status(404).send(info);
    }
    if (info && info.message) {
      logger.debug('EXECUTING: (requireLocalAuth) Error: ' + info.message);
      return res.status(422).send({ message: info.message });
    }
    req.user = user;
    next();
  })(req, res, next);
};

module.exports = requireLocalAuth;
