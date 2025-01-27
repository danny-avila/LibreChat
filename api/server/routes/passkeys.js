// routes/passkeys.js
const express = require('express');
const passport = require('passport');
const crypto = require('crypto');
const router = express.Router();

// For demo, we'll keep track of challenges in-memory:
const inMemoryChallenges = {};
// For real apps, store/fetch challenges per user from DB or Redis, keyed by userId or session.

// Helper to generate random challenges
function generateRandomChallenge() {
  return Buffer.from(crypto.randomBytes(32)).toString('base64url');
}

/* -------------------------------------------
 * 1) Registration (Attestation)
 * -------------------------------------------
 * Flow:
 *   - /register/begin   => server returns challenge + config to client
 *   - client calls navigator.credentials.create({ publicKey: ... })
 *   - /register/finish  => server verifies with passport-fido2-webauthn
 */

// BEGIN Registration
router.post('/register/begin', (req, res) => {
  const { userId, username } = req.body;
  if (!userId) {
    return res.status(400).json({ error: 'Missing userId' });
  }

  // Generate a challenge
  const challenge = generateRandomChallenge();
  inMemoryChallenges[userId] = challenge;

  // Minimal config for WebAuthn registration
  const options = {
    challenge, // required
    rp: { name: 'MyApp Passkeys Demo' },
    user: {
      id: userId, // must be a string
      name: username || `User-${userId}`,
      displayName: username || `User-${userId}`,
    },
    pubKeyCredParams: [{ type: 'public-key', alg: -7 }], // e.g., ES256
    attestation: 'none', // or 'direct', 'indirect'
    timeout: 60000,
  };

  return res.json(options);
});

// FINISH Registration
router.post(
  '/register/finish',
  // This will invoke our "webauthn" strategy that we added to Passport
  passport.authenticate('webauthn', { session: false }),
  (req, res) => {
    // If successful, `req.user` is the user object from passkeyStrategy's `done(null, user)`
    return res.json({
      success: true,
      user: req.user,
      message: 'Passkey registration successful',
    });
  },
);

/* -------------------------------------------
 * 2) Login (Assertion)
 * -------------------------------------------
 * Flow:
 *   - /login/begin   => server returns challenge + config to client
 *   - client calls navigator.credentials.get({ publicKey: ... })
 *   - /login/finish  => server verifies credential with passport-fido2-webauthn
 */

// BEGIN Login
router.post('/login/begin', (req, res) => {
  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({ error: 'Missing userId' });
  }

  // Generate a new challenge
  const challenge = generateRandomChallenge();
  inMemoryChallenges[userId] = challenge;

  // Allow credentials: if you have stored credentialIDs for this user, put them here.
  // For demo, we'll skip specifying actual credential IDs and leave the array empty.
  const allowCredentials = [];

  const options = {
    challenge,
    allowCredentials,
    userVerification: 'preferred',
    timeout: 60000,
  };

  return res.json(options);
});

// FINISH Login
router.post(
  '/login/finish',
  passport.authenticate('webauthn', { session: false }),
  (req, res) => {
    // If we arrive here, webauthn strategy says it's valid
    return res.json({
      success: true,
      user: req.user,
      message: 'Passkey login successful',
    });
  },
);

module.exports = router;
