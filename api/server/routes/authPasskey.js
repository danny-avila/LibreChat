const express = require('express');
const passport = require('passport');
const { SessionChallengeStore } = require('passport-fido2-webauthn');
const { setAuthTokens } = require('~/server/services/AuthService');
const base64url = require('base64url');
const uuid = require('uuid').v4;

const router = express.Router();
const store = new SessionChallengeStore();

// Challenge route for logging in
router.post('/login/public-key/challenge', (req, res, next) => {
  store.challenge(req, (err, challenge) => {
    if (err) {
      return next(err);
    }
    // Return the challenge to the client
    return res.json({ challenge: base64url.encode(challenge) });
  });
});

// Login with passkey
router.post(
  '/login/public-key',
  passport.authenticate('webauthn', {
    failureMessage: true,
    failWithError: true,
  }),
  async (req, res) => {
    try {
      // 1) Set your session tokens/cookies (similar to OAuth)
      await setAuthTokens(req.user._id, res);

      // 2) Return a JSON response or redirect
      return res.json({
        ok: true,
        location: '/',
        message: 'Successfully logged in with passkey',
      });
    } catch (err) {
      console.error('Error while setting passkey auth tokens:', err);
      return res.status(500).json({ ok: false, message: 'Internal Server Error' });
    }
  },
  (err, req, res, next) => {
    if (Math.floor(err.status / 100) !== 4) {
      return next(err);
    }
    // On failure
    res.json({ ok: false, location: '/login', message: err.message || 'Login error' });
  },
);

// Challenge route for signup
router.post('/signup/public-key/challenge', (req, res, next) => {
  // Generate a random buffer for user handle
  const handle = uuid({}, Buffer.alloc(16));
  const user = {
    id: handle,
    name: req.body.username,
    displayName: req.body.name,
  };

  store.challenge(req, { user }, (err, challenge) => {
    if (err) {
      return next(err);
    }
    // Return user info & challenge to the client
    user.id = base64url.encode(user.id);
    res.json({
      user,
      challenge: base64url.encode(challenge),
    });
  });
});

module.exports = router;
