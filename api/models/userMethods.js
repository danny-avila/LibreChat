const { verifyPassword } = require('~/server/utils/crypto');

/**
 * Compares the provided password with the user's password.
 * Uses PBKDF2-HMAC-SHA256 for FIPS compliance.
 *
 * @param {IUser} user - The user to compare the password for.
 * @param {string} candidatePassword - The password to test against the user's password.
 * @returns {Promise<boolean>} A promise that resolves to a boolean indicating if the password matches.
 */
const comparePassword = async (user, candidatePassword) => {
  if (!user) {
    throw new Error('No user provided');
  }

  if (!user.password) {
    throw new Error('No password, likely an email first registered via Social/OIDC login');
  }

  return verifyPassword(candidatePassword, user.password);
};

module.exports = {
  comparePassword,
};
