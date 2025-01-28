const express = require('express');
const passport = require('passport');
const base64url = require('base64url');
const { v4: uuidv4 } = require('uuid');

const { sessionChallengeStore } = require('~/cache');
const { setAuthTokens } = require('~/server/services/AuthService');
const { logger } = require('~/config');

/* Define client and server domains */
const domains = {
  client: process.env.DOMAIN_CLIENT,
  server: process.env.DOMAIN_SERVER,
};

const router = express.Router();

/* ---------------------------------------
 * LOGIN Challenge
 *    POST /api/auth/passkey/login/public-key/challenge
 * --------------------------------------- */
router.post('/login/public-key/challenge', (req, res, next) => {
  logger.info('Received login challenge request', { path: req.path, method: req.method });

  sessionChallengeStore.challenge(req, (err, challenge) => {
    if (err) {
      logger.error('Error generating login challenge', { error: err });
      return next(err);
    }
    logger.debug('Login challenge generated', { challenge: base64url.encode(challenge) });
    res.json({ challenge: base64url.encode(challenge) });
  });
});

/* ---------------------------------------
 * LOGIN Final
 *    POST /api/auth/passkey/login/public-key
 *    Handles authentication and redirects
 * --------------------------------------- */
router.post(
  '/login/public-key',
  passport.authenticate('webauthn', {
    failureMessage: true,
    failWithError: true,
    session: false, // Not using Passport sessions
  }),
  async (req, res, next) => {
    logger.info('Authentication successful for user', { userId: req.user._id });

    try {
      // Set authentication tokens (e.g., JWTs)
      await setAuthTokens(req.user._id, res);
      logger.debug('Auth tokens set for user', { userId: req.user._id });

      // Redirect to client
      return res.redirect(domains.client);
    } catch (err) {
      logger.error('Passkey login - setAuthTokens error', { error: err, userId: req.user._id });
      return next(err);
    }
  },
  (err, req, res, next) => {
    // Handle authentication failures by redirecting to /error
    if (Math.floor(err.status / 100) !== 4) {
      logger.error('Authentication error', { error: err });
      return next(err);
    }
    logger.warn('Authentication failed', { error: err.message, userId: req.user ? req.user._id : 'unknown' });
    res.redirect('/api/auth/passkey/error');
  },
);

/* ---------------------------------------
 * SIGNUP Challenge
 *    POST /api/auth/passkey/signup/public-key/challenge
 * --------------------------------------- */
router.post('/signup/public-key/challenge', (req, res, next) => {
  logger.info('Received signup challenge request', { path: req.path, method: req.method, body: req.body });

  // Generate a unique user handle
  const handleBuf = Buffer.from(uuidv4().replace(/-/g, ''), 'hex'); // 16 bytes
  const user = {
    id: handleBuf,
    name: req.body.email.split('@')[0],
    displayName: req.body.email.split('@')[0],
    email: req.body.email, // Ensure email is provided
  };

  if (!user.email) {
    logger.warn('Signup challenge failed: Email is required', { body: req.body });
    return res.status(400).json({ message: 'Email is required for signup.' });
  }

  sessionChallengeStore.challenge(req, { user }, (err, challenge) => {
    if (err) {
      logger.error('Error generating signup challenge', { error: err, email: req.body.email });
      return next(err);
    }
    const encodedUserId = base64url.encode(user.id);
    logger.debug('Signup challenge generated', { challenge: base64url.encode(challenge), user: { ...user, id: encodedUserId } });
    res.json({
      user: {
        ...user,
        id: encodedUserId, // Send base64url encoded user id
      },
      challenge: base64url.encode(challenge),
    });
  });
});

/* ---------------------------------------
 * SIGNUP Final
 *    POST /api/auth/passkey/signup/public-key
 *    Handles registration and redirects
 * --------------------------------------- */
router.post(
  '/signup/public-key',
  passport.authenticate('webauthn', {
    failureMessage: true,
    failWithError: true,
    session: false, // Not using Passport sessions
  }),
  async (req, res, next) => {
    logger.info('Registration successful for user', { userId: req.user._id });

    try {
      // Set authentication tokens (e.g., JWTs)
      await setAuthTokens(req.user._id, res);
      logger.debug('Auth tokens set for new user', { userId: req.user._id });

      // Redirect to client
      return res.redirect(domains.client);
    } catch (err) {
      logger.error('Passkey signup - setAuthTokens error', { error: err, userId: req.user._id });
      return next(err);
    }
  },
  (err, req, res, next) => {
    // Handle registration failures by redirecting to /error
    if (Math.floor(err.status / 100) !== 4) {
      logger.error('Registration error', { error: err });
      return next(err);
    }
    logger.warn('Registration failed', { error: err.message, email: req.body.email });
    res.redirect('/api/auth/passkey/error');
  },
);

/* ---------------------------------------
 * CUSTOM ERROR ROUTE
 *    GET /api/auth/passkey/error
 *    Handles all authentication errors
 * --------------------------------------- */
router.get('/error', (req, res) => {
  // Ensure that req.session.messages exists and has at least one message
  const errorMessage = (req.session.messages && req.session.messages.pop()) || 'Authentication error occurred.';

  logger.error('Error in PassKey authentication:', { message: errorMessage });

  // Optionally, you can clear all messages to prevent reuse
  req.session.messages = [];

  // Redirect to client’s login page
  res.redirect(`${domains.client}/login`);
});

// Log route initialization
logger.info('Passkey authentication routes initialized');

module.exports = router;
