const jwt = require('jsonwebtoken');
const { getTenantId, toClerkTenantScope } = require('@librechat/data-schemas');

const matchesClerkTenantScope = (payload) => {
  if (payload?.authProvider !== 'clerk') {
    return true;
  }

  return (
    typeof payload.tenantScope === 'string' &&
    payload.tenantScope === toClerkTenantScope(getTenantId())
  );
};

const setTwoFactorTempUser = (req, _res, next) => {
  if (req.user?.id || req.user?._id) {
    return next();
  }

  const { tempToken } = req.body ?? {};
  if (!tempToken) {
    return next();
  }

  try {
    const payload = jwt.verify(tempToken, process.env.JWT_SECRET);
    if (payload?.userId && matchesClerkTenantScope(payload)) {
      req.user = { id: payload.userId };
    }
  } catch {
    return next();
  }

  return next();
};

module.exports = setTwoFactorTempUser;
