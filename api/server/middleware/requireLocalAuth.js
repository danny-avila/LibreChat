const passport = require('passport');
const DebugControl = require('../../utils/debug.js');

function log({ title, parameters }) {
  DebugControl.log.functionName(title);
  if (parameters) {
    DebugControl.log.parameters(parameters);
  }
}

const requireLocalAuth = (req, res, next) => {
  passport.authenticate('local', (err, user, info) => {
    if (err) {
      log({
        title: '(requireLocalAuth) Error at passport.authenticate',
        parameters: [{ name: 'error', value: err }],
      });
      return next(err);
    }
    if (!user) {
      log({
        title: '(requireLocalAuth) Error: No user',
      });
      return res.status(422).send(info);
    }
    req.user = user;
    next();
  })(req, res, next);
};

module.exports = requireLocalAuth;
