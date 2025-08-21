const { SystemRoles } = require('librechat-data-provider');
const { logger } = require('~/config');

/**
 * Helper function to check if a user is a hardcoded admin (username-only)
 * 
 * @param {string} username - Username to check
 * @returns {boolean} - True if user is a hardcoded admin
 */
function isHardcodedAdmin(username) {
  if (!username) {
    logger.error('[Stripe:isHardcodedAdmin] message=No username found');
    return false;
  }

  // example: HARDCODED_ADMIN_USERNAMES=username1,username2,username3
  const hardcodedAdminUsernames = process.env.HARDCODED_ADMIN_USERNAMES;
  if (hardcodedAdminUsernames) {
    const adminUsernames = hardcodedAdminUsernames.split(',').map(username => username.trim().toLowerCase());
    if (username && adminUsernames.includes(username.toLowerCase())) {
      return true;
    }
  }

  return false;
}

/**
 * Modifies the user object to ensure that only hardcoded admins have admin role
 * 
 * @param {Object} user - User object
 * @returns {Object} - User object with modified role
 */
function ensureHardcodedAdminRole(user) {
  if (!user) {
    logger.error('[Stripe:ensureHardcodedAdminRole] message=No user found');
    return user;
  }

  if (isHardcodedAdmin(user.username)) {
    user.role = SystemRoles.ADMIN;
  } else {
    // User is NOT a hardcoded admin → force role to USER (even if DB says ADMIN)
    user.role = SystemRoles.USER;
  }

  return user;
}

/**
 * Checks if a user should have admin access
 * Fallback to database role check when hardcoded admin is not enabled
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
    return isHardcodedAdmin(user.username);
  }
  // Fallback to database role check when hardcoded admin is not enabled
  return user.role === SystemRoles.ADMIN;
}

module.exports = {
  ensureHardcodedAdminRole,
  checkAdminAccess,
};