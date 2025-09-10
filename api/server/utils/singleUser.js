const { SystemRoles } = require('librechat-data-provider');

// Provides a consistent single-user object when auth is disabled
// Uses env overrides when available
const DEFAULT_ID = process.env.SINGLE_USER_ID || '000000000000000000000001';

function getSingleUser() {
  return {
    id: DEFAULT_ID,
    _id: DEFAULT_ID,
    email: process.env.SINGLE_USER_EMAIL || 'minty@localhost',
    name: process.env.SINGLE_USER_NAME || 'Minty',
    provider: 'local',
    role: process.env.SINGLE_USER_ROLE || SystemRoles.USER,
    emailVerified: true,
  };
}

module.exports = { getSingleUser };
