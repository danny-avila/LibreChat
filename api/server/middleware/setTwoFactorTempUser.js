const jwt = require('jsonwebtoken');

const setTwoFactorTempUserFrom = (field) => (req, _res, next) => {
  if (req.user?.id || req.user?._id) {
    return next();
  }

  const token = req.body?.[field];
  if (!token) {
    return next();
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload?.userId) {
      req.user = { id: payload.userId };
    }
  } catch {
    return next();
  }

  return next();
};

const setTwoFactorTempUser = setTwoFactorTempUserFrom('tempToken');
const setTwoFactorAcknowledgementTempUser = setTwoFactorTempUserFrom('acknowledgementToken');
const setTwoFactorFinalizationTempUser = setTwoFactorTempUserFrom('finalizationToken');

module.exports = setTwoFactorTempUser;
module.exports.setTwoFactorAcknowledgementTempUser = setTwoFactorAcknowledgementTempUser;
module.exports.setTwoFactorFinalizationTempUser = setTwoFactorFinalizationTempUser;
