const passport = require('passport');
const DebugControl = require('../utils/debug.js');

function log({ title, parameters }) {
  DebugControl.log.functionName(title);
  DebugControl.log.parameters(parameters);
}

const requireLocalAuth = (req, res, next) => {
  log({
    title: 'Require Local Auth',
    parameters: [{ name: 'req.body', value: req.body }]
  });
  passport.authenticate('local', (err, user, info) => {
    if (err) {
      return next(err);
    }
    if (!user) {
      return res.status(422).send(info);
    }
    req.user = user;
    next();
  })(req, res, next);
};

module.exports = requireLocalAuth;
