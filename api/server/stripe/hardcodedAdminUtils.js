const { SystemRoles } = require('librechat-data-provider');
const { logger } = require('~/config');

/**
 * Helper function to check if a user is a hardcoded admin (username-only)
 * This function should be used consistently across authentication strategies
 * 
 * @param {Object} user - User object with username field
 * @returns {boolean} - True if user is a hardcoded admin
 */
function isHardcodedAdmin(user) {
  if (!user) {
    logger.error('[Stripe:isHardcodedAdmin] message=No user found');
    return false;
  }

  const hardcodedAdminUsernames = process.env.HARDCODED_ADMIN_USERNAMES;
  if (hardcodedAdminUsernames) {
    const adminUsernames = hardcodedAdminUsernames.split(',').map(username => username.trim().toLowerCase());
    if (user.username && adminUsernames.includes(user.username.toLowerCase())) {
      return true;
    }
  }

  return false;
}

/**
 * Helper function to ensure ONLY hardcoded admins have admin role
 * This enforces that admin privileges are exclusively for hardcoded admin users
 * 
 * @param {Object} user - User object
 * @returns {Object} - User object with role set based on hardcoded admin status
 */
function ensureHardcodedAdminRole(user) {
  if (!user) {
    logger.error('[Stripe:ensureHardcodedAdminRole] message=No user found');
    return user;
  }

  if (isHardcodedAdmin(user)) {
    user.role = SystemRoles.ADMIN;
  } else {
    // User is NOT a hardcoded admin → force role to USER (even if DB says ADMIN)
    user.role = SystemRoles.USER;
  }

  return user;
}

/**
 * Main function to check if a user should have admin access
 * Handles both hardcoded admin mode and fallback to database roles
 * 
 * @param {Object} user - User object
 * @returns {boolean} - True if user should have admin access
 */
function checkAdminAccess(user) {
  if (!user) {
    logger.error('[Stripe:checkAdminAccess] message=No user found');
    return false;
  }
  if (process.env.HARDCODED_ADMIN_USERNAMES) {
    logger.info('[Stripe:checkAdminAccess] message=Hardcoded admin mode enabled');
    return isHardcodedAdmin(user);
  }
  // Fallback to database role check when hardcoded admin is not enabled
  return user.role === SystemRoles.ADMIN;
}

module.exports = {
  isHardcodedAdmin,
  ensureHardcodedAdminRole,
  checkAdminAccess,
};