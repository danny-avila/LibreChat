const { isTarsConfigured, isTarsAdminRole } = require('@librechat/api');

/**
 * Gates pwc_tars admin operations (domain / knowledge-base management). Requires
 * the integration to be configured and the caller to be a linked pwc_tars user
 * whose pwc_tars role is an admin role — mirroring how pwc_tars itself gates
 * these endpoints. Must run after `requireJwtAuth`.
 */
const requireTarsAdmin = (req, res, next) => {
  if (!isTarsConfigured() || !req.user?.tarsId || !isTarsAdminRole(req.user.tarsRoleId)) {
    return res.status(403).json({ error: 'pwc_tars admin access required' });
  }
  next();
};

module.exports = requireTarsAdmin;
