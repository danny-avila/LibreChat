const jwt = require('jsonwebtoken');

/**
 * Issue a short-lived ticket JWT for Scaffad Shop SSO.
 * Uses the same JWT_SECRET as LibreChat/PDF Builder by default.
 *
 * @param {Object} user - Authenticated LibreChat user from req.user
 * @param {Object} [profile] - Optional user profile (for role)
 * @returns {string} signed JWT ticket
 */
const issueScaffadShopTicket = (user, profile) => {
  if (!user || !user.id) {
    throw new Error('Cannot issue shop ticket without authenticated user');
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not configured');
  }

  const ttlSeconds = Number(process.env.SCAFFAD_SHOP_TICKET_TTL_SECONDS || 300);

  const payload = {
    sub: user.id,
    email: user.email,
    name: user.name || user.username || user.email,
    role: profile?.profileType || user.role || 'customer',
  };

  return jwt.sign(payload, secret, { expiresIn: ttlSeconds });
};

module.exports = {
  issueScaffadShopTicket,
};

