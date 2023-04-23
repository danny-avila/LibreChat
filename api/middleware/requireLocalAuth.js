const passport = require('passport');
const DebugControl = require('../utils/debug.js');

function log({ title, parameters }) {
  DebugControl.log.functionName(title);
  if (parameters) {
    DebugControl.log.parameters(parameters);
  }
}

const requireLocalAuth = (req, res, next) => {
  log({
    title: 'Require Local Auth',
    parameters: [{ name: 'req.body', value: req.body }]
  });
  passport.authenticate('local', (err, user, info) => {
    if (err) {
      log({
        title: 'Passport Auth Error',
        parameters: [{ name: 'error', value: err }]
      });
      return next(err);
    }
    if (!user) {
      log({
        title: '(requireLocalAuth) Login Failed - User Not Found',
      });
      return res.status(422).send(info);
    }
    req.user = user;
    next();
  })(req, res, next);
};

module.exports = requireLocalAuth;
