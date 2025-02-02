const express = require('express');
const passport = require('passport');
const { setAuthTokens } = require('~/server/services/AuthService');
const router = express.Router();

// Registration Challenge Endpoint (GET) - stateless
router.get(
  '/register',
  passport.authenticate('webauthn', { session: false }),
  (req, res) => {
    res.json(req.user); // Returns challenge options
  },
);

// Registration Callback Endpoint (POST) - stateless
router.post(
  '/register',
  passport.authenticate('webauthn', { session: false, failureRedirect: '/login' }),
  (req, res) => {
    // On success, req.user contains the updated user (with new passkey)
    res.json({ user: req.user });
  },
);

// Login Challenge Endpoint (GET) - stateless
router.get(
  '/login',
  passport.authenticate('webauthn', { session: false }),
  (req, res) => {
    res.json(req.user); // Returns challenge options
  },
);

// Login Callback Endpoint (POST) - stateless, token-based authentication
router.post(
  '/login',
  passport.authenticate('webauthn', { session: false, failureRedirect: '/login' }),
  async (req, res) => {
    try {
      const token = await setAuthTokens(req.user.id, res);
      // Send back the token and user info as JSON.
      res.status(200).json({ token, user: req.user });
    } catch (err) {
      console.error('[WebAuthn Login Callback]', err);
      res.status(500).json({ message: 'Something went wrong during login' });
    }
  },
);

module.exports = router;