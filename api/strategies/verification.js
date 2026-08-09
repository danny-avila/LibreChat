const { checkEmailConfig } = require('@librechat/api');
const { updateUser } = require('~/models');

/** Unix timestamp for 2024-06-07 15:20:18 Eastern Time, when verification became mandatory. */
const verificationEnabledTimestamp = 1717788018;

/**
 * Accounts created before verification was mandatory were never given a way to verify,
 * so on a deployment with no email configured they would be locked out for good. Marking
 * them verified as they sign in is the compatibility path.
 *
 * This has to apply to every login method: gating it per strategy means the same account
 * is accepted by one factor and refused by another.
 *
 * Mutates `user.emailVerified` so callers can keep reading it after the await.
 *
 * @param {{ _id?: unknown, id?: unknown, emailVerified?: boolean, createdAt?: string | Date }} user
 * @returns {Promise<boolean>} whether the account counts as verified afterwards
 */
const grandfatherLegacyEmailVerification = async (user) => {
  if (user?.emailVerified) {
    return true;
  }
  if (!user || checkEmailConfig()) {
    return false;
  }

  const createdAtMs = new Date(user.createdAt).getTime();
  if (!Number.isFinite(createdAtMs)) {
    return false;
  }
  if (Math.floor(createdAtMs / 1000) >= verificationEnabledTimestamp) {
    return false;
  }

  await updateUser(user._id ?? user.id, { emailVerified: true });
  user.emailVerified = true;
  return true;
};

module.exports = { grandfatherLegacyEmailVerification, verificationEnabledTimestamp };
