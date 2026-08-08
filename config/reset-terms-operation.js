/**
 * Resets terms acceptance and invalidates the shared authentication-user cache
 * after the authority mutation is durably published.
 *
 * @param {{
 *   userModel: { updateMany: Function },
 *   authority: { mutateMCPAuthority: Function },
 *   authUserCache: { clear: Function },
 * }} dependencies
 */
async function resetTermsAcceptance({ userModel, authority, authUserCache }) {
  const { result } = await authority.mutateMCPAuthority(() =>
    userModel.updateMany({}, { $set: { termsAccepted: false, termsAcceptedAt: null } }),
  );
  await authUserCache.clear();
  return result;
}

module.exports = resetTermsAcceptance;
