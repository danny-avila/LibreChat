const passport = require('passport');

// This middleware does not require authentication,
// but if the user is authenticated, it will set the user object.
const optionalJwtAuth = (req, res, next) => {
  passport.authenticate('jwt', { session: false }, (err, user) => {
    if (err) {
      return next(err);
    }
    if (user) {
      req.user = user;
    }
    next();
  })(req, res, next);
};

module.exports = optionalJwtAuth;
