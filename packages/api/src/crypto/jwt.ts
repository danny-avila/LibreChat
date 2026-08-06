import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';

const fallbackSecret = crypto.randomBytes(32).toString('hex');

/**
 * Generate a short-lived JWT token
 * @param {String} userId - The ID of the user
 * @param {String} [expireIn='5m'] - The expiration time for the token (default is 5 minutes)
 * @returns {String} - The generated JWT token
 */
export const generateShortLivedToken = (userId: string, expireIn: string = '5m'): string => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET ?? fallbackSecret, {
    expiresIn: expireIn,
    algorithm: 'HS256',
  });
};
