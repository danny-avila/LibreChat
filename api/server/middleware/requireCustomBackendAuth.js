const passport = require('passport');
const { logger } = require('@librechat/data-schemas');

/**
 * Custom authentication middleware that replaces requireLocalAuth
 * Uses the custom backend strategy for authentication
 */
const requireCustomBackendAuth = (req, res, next) => {
  passport.authenticate('custom-backend', (err, user, info) => {
    if (err) {
      logger.error('[requireCustomBackendAuth] Error at passport.authenticate:', err);
      return next(err);
    }
    
    if (!user) {
      logger.debug('[requireCustomBackendAuth] Error: No user');
      return res.status(404).send(info);
    }
    
    if (info && info.message) {
      logger.debug('[requireCustomBackendAuth] Error: ' + info.message);
      return res.status(422).send({ message: info.message });
    }
    
    req.user = user;
    next();
  })(req, res, next);
};

module.exports = requireCustomBackendAuth;
