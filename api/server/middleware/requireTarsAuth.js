const passport = require('passport');

const requireTarsAuth = (req, res, next) => {
  passport.authenticate('tars', { session: false }, (err, user, info) => {
    if (err) {
      return next(err);
    }
    if (!user) {
      return res.status(404).send(info);
    }
    req.user = user;
    next();
  })(req, res, next);
};

module.exports = requireTarsAuth;
