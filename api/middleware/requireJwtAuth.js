const passport = require('passport');

const requireJwtAuth = (req, res, next) => {
  passport.authenticate('jwt', { session: false }, (err, user) => {
    if (err) {
      console.log(err);
    }

    if (err) {
      console.log(err);
      return res.status(500).json({ error: 'An error occurred during authentication' });
    }

    if (!user) {
      req.user = false; // Assigns false to req.user if no user logged in
    } else {
      req.user = user; // Assigns the user object to req.user if user logged in
    }
    next();
  })(req, res, next);
}

module.exports = requireJwtAuth;
