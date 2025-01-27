// ~/strategies/passkeyStrategy.js
const { Strategy: WebAuthnStrategy } = require('passport-fido2-webauthn');
const { logger } = require('~/config');
const { Strategy: DiscordStrategy } = require('passport-discord');

// In-memory user store for demo purposes.
// In production, use your DB to fetch and save user passkeys.
const users = {};

/**
 * Callback for verifying passkey credentials once passport-fido2-webauthn
 * has done the cryptographic verification.
 *
 * @param {object} publicKeyCredential The credential from the client
 * @param {function} done The Passport callback
 */
async function passkeyLogin(publicKeyCredential, done) {
  try {
    // The userId is typically embedded in the credential when registering.
    // This can be done in the "options.user.id" you provide on registration.
    const userId = publicKeyCredential.user?.id;

    if (!userId) {
      logger.warn('[Passkeys] Missing userId in credential');
      return done(null, false);
    }

    // If this user doesn't exist yet, create them in memory.
    // Alternatively, fetch from DB, etc.
    if (!users[userId]) {
      users[userId] = {
        id: userId,
        displayName: `User-${userId}`,
        // You might store passkey data here if you want, e.g.:
        passkeys: [publicKeyCredential.authenticator],
      };
    }

    // Example: update or store the user's passkeys in the DB if needed.
    // For demo, we skip it.

    const user = users[userId];
    logger.info('[Passkeys] Successful passkey verification for user:', user);

    // `done(null, user)` means success; pass the user object to the next step
    return done(null, user);
  } catch (error) {
    logger.error('[Passkeys] Verification error:', error);
    return done(error);
  }
}

// Export a function that returns a configured instance of the WebAuthnStrategy.
module.exports = () =>
  new WebAuthnStrategy(
    {
      rpName: process.env.PASSKEY_RP_NAME || 'MyApp Passkey Demo',
      // rpID should match your domain (e.g. "example.com"). For local dev, 'localhost' typically works:
      rpID: process.env.PASSKEY_RP_ID || 'localhost',
      // You can provide additional options, such as a challengeStore, if you want to manage your own challenge lookups.
    },
    passkeyLogin,
  );
