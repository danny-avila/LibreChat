const { SystemRoles } = require('librechat-data-provider');
const { logger } = require('@librechat/data-schemas');

function checkAdmin(req, res, next) {
  try {
    if (req.user.role !== SystemRoles.ADMIN) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    next();
  } catch (error) {
    logger.error('Error in checkAdmin middleware:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
}

module.exports = checkAdmin;
