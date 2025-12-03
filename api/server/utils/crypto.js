/**
 * FIPS-compliant cryptographic utilities for LibreChat.
 *
 * This module provides password hashing and token hashing using PBKDF2-HMAC-SHA256,
 * which is FIPS 140-2/140-3 approved, replacing bcrypt which is not FIPS-approved.
 *
 * BREAKING CHANGE: Passwords hashed with bcrypt will NOT verify with these functions.
 * Existing deployments upgrading to FIPS mode will require password resets.
 */

const crypto = require('crypto');

// PBKDF2 configuration
// 310,000 iterations is OWASP recommended minimum for PBKDF2-HMAC-SHA256 (2023)
// https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
const PBKDF2_ITERATIONS = 310000;
const PBKDF2_KEYLEN = 32; // 256 bits
const PBKDF2_DIGEST = 'sha256';
const SALT_LENGTH = 16; // 128 bits

/**
 * Hashes a password using PBKDF2-HMAC-SHA256.
 *
 * @param {string} password - The plaintext password to hash
 * @returns {Promise<string>} - The hashed password in format: iterations:salt:hash (all hex)
 */
const hashPassword = async (password) => {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(SALT_LENGTH);

    crypto.pbkdf2(password, salt, PBKDF2_ITERATIONS, PBKDF2_KEYLEN, PBKDF2_DIGEST, (err, derivedKey) => {
      if (err) {
        reject(err);
        return;
      }
      // Store as: iterations:salt:hash (allows future iteration upgrades)
      const hash = `${PBKDF2_ITERATIONS}:${salt.toString('hex')}:${derivedKey.toString('hex')}`;
      resolve(hash);
    });
  });
};

/**
 * Synchronous version of hashPassword for cases where async is not possible.
 *
 * @param {string} password - The plaintext password to hash
 * @returns {string} - The hashed password in format: iterations:salt:hash (all hex)
 */
const hashPasswordSync = (password) => {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const derivedKey = crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, PBKDF2_KEYLEN, PBKDF2_DIGEST);
  return `${PBKDF2_ITERATIONS}:${salt.toString('hex')}:${derivedKey.toString('hex')}`;
};

/**
 * Verifies a password against a PBKDF2 hash.
 *
 * @param {string} password - The plaintext password to verify
 * @param {string} storedHash - The stored hash in format: iterations:salt:hash
 * @returns {Promise<boolean>} - True if password matches, false otherwise
 */
const verifyPassword = async (password, storedHash) => {
  return new Promise((resolve, reject) => {
    const parts = storedHash.split(':');
    if (parts.length !== 3) {
      // Invalid hash format
      resolve(false);
      return;
    }

    const iterations = parseInt(parts[0], 10);
    const salt = Buffer.from(parts[1], 'hex');
    const hash = Buffer.from(parts[2], 'hex');

    crypto.pbkdf2(password, salt, iterations, hash.length, PBKDF2_DIGEST, (err, derivedKey) => {
      if (err) {
        reject(err);
        return;
      }
      // Use timing-safe comparison to prevent timing attacks
      resolve(crypto.timingSafeEqual(hash, derivedKey));
    });
  });
};

/**
 * Synchronous version of verifyPassword.
 *
 * @param {string} password - The plaintext password to verify
 * @param {string} storedHash - The stored hash in format: iterations:salt:hash
 * @returns {boolean} - True if password matches, false otherwise
 */
const verifyPasswordSync = (password, storedHash) => {
  const parts = storedHash.split(':');
  if (parts.length !== 3) {
    return false;
  }

  const iterations = parseInt(parts[0], 10);
  const salt = Buffer.from(parts[1], 'hex');
  const hash = Buffer.from(parts[2], 'hex');

  const derivedKey = crypto.pbkdf2Sync(password, salt, iterations, hash.length, PBKDF2_DIGEST);
  return crypto.timingSafeEqual(hash, derivedKey);
};

/**
 * Hashes a token using SHA-256.
 * Used for verification tokens, password reset tokens, etc.
 *
 * @param {string} token - The plaintext token to hash
 * @returns {string} - The SHA-256 hash in hex format
 */
const hashToken = (token) => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

/**
 * Verifies a token against a SHA-256 hash.
 *
 * @param {string} token - The plaintext token to verify
 * @param {string} storedHash - The stored SHA-256 hash
 * @returns {boolean} - True if token matches, false otherwise
 */
const verifyToken = (token, storedHash) => {
  const hash = hashToken(token);
  // Use timing-safe comparison
  try {
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(storedHash, 'hex'));
  } catch {
    return false;
  }
};

/**
 * Generates a cryptographically secure random token.
 *
 * @param {number} [length=32] - Number of random bytes (output will be hex, so 2x length)
 * @returns {string} - Random token in hex format
 */
const generateSecureToken = (length = 32) => {
  return crypto.randomBytes(length).toString('hex');
};

module.exports = {
  hashPassword,
  hashPasswordSync,
  verifyPassword,
  verifyPasswordSync,
  hashToken,
  verifyToken,
  generateSecureToken,
  // Export constants for testing/documentation
  PBKDF2_ITERATIONS,
  PBKDF2_KEYLEN,
  PBKDF2_DIGEST,
};
