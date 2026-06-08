const jwt = require('jsonwebtoken');

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
    if (payload?.userId) {
      req.user = { id: payload.userId };
    }
  } catch {
    return next();
  }

  return next();
};

module.exports = setTwoFactorTempUser;
