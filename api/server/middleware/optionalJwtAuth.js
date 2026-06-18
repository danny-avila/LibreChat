const passport = require('passport');
const { tenantContextMiddleware } = require('@librechat/api');

// This middleware does not require authentication,
// but if the user is authenticated, it will set the user object
// and establish tenant ALS context.
const optionalJwtAuth = (req, res, next) => {
  const callback = (err, user) => {
    if (err) {
      return next(err);
    }
    if (user) {
      req.user = user;
      req.authStrategy = 'jwt';
      return tenantContextMiddleware(req, res, next);
    }
    next();
  };
  passport.authenticate('jwt', { session: false }, callback)(req, res, next);
};

module.exports = optionalJwtAuth;
