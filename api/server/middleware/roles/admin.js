const { SystemRoles } = require('librechat-data-provider');

function checkAdmin(req, res, next) {
  try {
    // Check if user is authenticated first
    if (!req.user) {
      return res.status(401).json({ 
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
        timestamp: new Date(),
      });
    }

    // Check if user has admin role
    if (req.user.role !== SystemRoles.ADMIN) {
      return res.status(403).json({ 
        error: {
          code: 'FORBIDDEN',
          message: 'Access denied. Administrator privileges required.',
        },
        timestamp: new Date(),
      });
    }

    next();
  } catch (error) {
    console.error('[checkAdmin] Error:', error);
    res.status(500).json({ 
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Internal server error',
      },
      timestamp: new Date(),
    });
  }
}

module.exports = checkAdmin;
