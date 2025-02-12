const express = require('express');
const passport = require('passport');
const { setAuthTokens } = require('~/server/services/AuthService');
const router = express.Router();

router.get(
  '/register',
  passport.authenticate('webauthn', { session: false }),
  (req, res) => {
    res.json(req.user);
  },
);

router.post(
  '/register',
  passport.authenticate('webauthn', { session: false, failureRedirect: '/login' }),
  (req, res) => {
    res.json({ user: req.user });
  },
);

router.get(
  '/login',
  passport.authenticate('webauthn', { session: false }),
  (req, res) => {
    res.json(req.user);
  },
);

router.post(
  '/login',
  passport.authenticate('webauthn', { session: false, failureRedirect: '/login' }),
  async (req, res) => {
    try {
      const token = await setAuthTokens(req.user.id, res);
      res.status(200).json({ token, user: req.user });
    } catch (err) {
      console.error('[WebAuthn Login Callback]', err);
      res.status(500).json({ message: 'Something went wrong during login' });
    }
  },
);

module.exports = router;