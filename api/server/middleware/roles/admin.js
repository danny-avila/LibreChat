const { checkAdminAccess } = require('~/server/stripe/hardcodedAdminUtils');

function checkAdmin(req, res, next) {
  try {
    if (checkAdminAccess(req.user)) {
      return next();
    }
    return res.status(403).json({ message: 'Forbidden' });
  } catch (error) {
    res.status(500).json({ message: 'Internal Server Error' });
  }
}

module.exports = checkAdmin;
