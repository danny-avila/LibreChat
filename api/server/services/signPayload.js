const jwt = require('jsonwebtoken');

/**
 * Signs a given payload using either the `jose` library (for Bun runtime) or `jsonwebtoken`.
 *
 * @async
 * @function
 * @param {Object} options - The options for signing the payload.
 * @param {Object} options.payload - The payload to be signed.
 * @param {string} options.secret - The secret key used for signing.
 * @param {number} options.expirationTime - The expiration time in seconds.
 * @returns {Promise<string>} Returns a promise that resolves to the signed JWT.
 * @throws {Error} Throws an error if there's an issue during signing.
 *
 * @example
 * const signedPayload = await signPayload({
 *   payload: { userId: 123 },
 *   secret: 'my-secret-key',
 *   expirationTime: 3600
 * });
 */
async function signPayload({ payload, secret, expirationTime }) {
  return jwt.sign(payload, secret, { expiresIn: expirationTime });
}

module.exports = signPayload;
