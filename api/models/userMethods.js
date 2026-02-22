const bcrypt = require('bcryptjs');

/**
 * Compares the provided password with the user's password.
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

  return new Promise((resolve, reject) => {
    bcrypt.compare(candidatePassword, user.password, (err, isMatch) => {
      if (err) {
        reject(err);
      }
      resolve(isMatch);
    });
  });
};

module.exports = {
  comparePassword,
};
