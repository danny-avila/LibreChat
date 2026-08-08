/**
 * A password reset stamps `credentialsChangedAt` on the user. Access tokens are stateless,
 * so a token minted before the reset keeps verifying on signature and `exp` alone unless the
 * stamp is consulted: this predicate is what makes a reset revoke outstanding access tokens.
 *
 * `iat` is whole seconds, so it only identifies the second a token was minted in, not its
 * position inside that second. Comparing the start of the issuing second against the
 * millisecond-precision stamp fails closed: a token minted in the same second as the reset is
 * rejected rather than accepted. Failing open there would let an attacker holding a live token
 * refresh in a tight loop, land a mint inside the reset's second and keep a full-lifetime token,
 * which is the attack the stamp exists to stop. The reset request issues no token of its own, so
 * the only cost is that a login completing within the same second as the reset must be retried.
 *
 * @param {{ iat?: number } | undefined} payload - Verified JWT payload.
 * @param {{ credentialsChangedAt?: Date | string | number } | undefined} user - User document.
 * @returns {boolean} Whether the token predates the user's last credential change.
 */
const isTokenIssuedBeforeCredentialChange = (payload, user) => {
  const changedAt = user?.credentialsChangedAt;
  if (!changedAt) {
    return false;
  }

  const changedAtMs =
    changedAt instanceof Date ? changedAt.getTime() : new Date(changedAt).getTime();
  /** An unreadable stamp revokes nothing; treating it as a cutoff would lock the account out for good */
  if (!Number.isFinite(changedAtMs)) {
    return false;
  }

  const issuedAt = payload?.iat;
  /** Without `iat` the token cannot be shown to postdate the reset */
  if (typeof issuedAt !== 'number' || !Number.isFinite(issuedAt)) {
    return true;
  }

  return issuedAt * 1000 < changedAtMs;
};

module.exports = { isTokenIssuedBeforeCredentialChange };
