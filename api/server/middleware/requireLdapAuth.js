const passport = require('passport');
const { ldapLogin } = require('~/strategies');

const CONNECTION_ERROR_CODES = new Set([
  'ECONNREFUSED',
  'ETIMEDOUT',
  'EHOSTUNREACH',
  'ENOTFOUND',
  'ECONNRESET',
]);

const isConnectionError = (err) => {
  if (err?.name === 'ConnectionError' || err?.name === 'TimeoutError') {
    return true;
  }
  if (err?.code && CONNECTION_ERROR_CODES.has(err.code)) {
    return true;
  }
  if (Array.isArray(err?.errors)) {
    return err.errors.some(
      (error) =>
        CONNECTION_ERROR_CODES.has(error?.code) ||
        error?.name === 'ConnectionError' ||
        error?.name === 'TimeoutError',
    );
  }
  return false;
};

const getLdapStrategyNames = () => {
  const urls = ldapLogin?.getLdapUrls?.() ?? [];
  if (urls.length > 1) {
    return urls.map((_, index) => (index === 0 ? 'ldapauth' : `ldapauth-${index}`));
  }
  return ['ldapauth'];
};

const requireLdapAuth = (req, res, next) => {
  const strategyNames = getLdapStrategyNames();
  let handled = false;
  const authenticate = (index = 0) => {
    if (handled) {
      return;
    }
    passport.authenticate(strategyNames[index], (err, user, info) => {
      if (handled) {
        return;
      }
      if (err && isConnectionError(err) && index < strategyNames.length - 1) {
        return authenticate(index + 1);
      }
      handled = true;
      if (err) {
        console.log({
          title: '(requireLdapAuth) Error at passport.authenticate',
          parameters: [{ name: 'error', value: err }],
        });
        return next(err);
      }
      if (!user) {
        console.log({
          title: '(requireLdapAuth) Error: No user',
        });
        return res.status(404).send(info);
      }
      req.user = user;
      next();
    })(req, res, next);
  };
  authenticate();
};

module.exports = requireLdapAuth;
