const passport = require('passport');
const { logger } = require('@librechat/data-schemas');

const requireLocalAuth = (req, res, next) => {
  passport.authenticate('local', (err, user, info) => {
    if (err) {
      logger.error('[requireLocalAuth] Error at passport.authenticate:', err);
      return next(err);
    }
    if (!user) {
      logger.debug('[requireLocalAuth] Error: No user');
      return res.status(404).send(info);
    }
    if (info && info.message) {
      logger.debug('[requireLocalAuth] Error: ' + info.message);
      let finalResponse;
      if (info.message.includes('currently under verification by the administrator')) {
        finalResponse = { errorCode: 'ERR_ADMIN_VERIFICATION_PENDING', message: info.message }
      } else {
        finalResponse = { message: info.message }
      }
      return res
        .status(422)
        .send(finalResponse);
    }
    req.user = user;
    next();
  })(req, res, next);
};

module.exports = requireLocalAuth;
