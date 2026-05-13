const crypto = require('crypto');
const { standardCache } = require('@librechat/api');

/**
 * Server-side state store for OAuth flows that need to round-trip extra
 * data (e.g. the originating native platform) through the OAuth provider.
 *
 * The state value is included in the redirect to the provider and comes
 * back on the callback (?state=... for GET, body.state for POST), which
 * makes it more reliable than cookies on iOS WebView callers — Apple
 * strips SameSite=Lax cookies on cross-site POST callbacks, and
 * SFSafariViewController cookie isolation can drop cookies across the
 * cross-site OAuth round trip in some configurations.
 */

const NAMESPACE = 'OAUTH_STATE';
const TTL_MS = 10 * 60 * 1000;

const store = standardCache(NAMESPACE, TTL_MS);

const generateToken = () => crypto.randomBytes(24).toString('base64url');

const putState = async (payload) => {
  const state = generateToken();
  await store.set(state, payload, TTL_MS);
  return state;
};

const consumeState = async (state) => {
  if (typeof state !== 'string' || state.length < 16) {
    return null;
  }
  const payload = await store.get(state);
  if (!payload) {
    return null;
  }
  await store.delete(state);
  return payload;
};

module.exports = {
  putState,
  consumeState,
};
