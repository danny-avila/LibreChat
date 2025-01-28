const express = require('express');
const passport = require('passport');
const { v4: uuidv4 } = require('uuid');
const { sessionChallengeStore } = require('~/strategies/webauthnStrategy');
const { setAuthTokens } = require('~/server/services/AuthService');
const User = require('~/models/User');
const { bufferToBase64url } = require('~/utils/encoding');

const router = express.Router();

/* Signup Challenge */
router.post('/signup/public-key/challenge', async (req, res, next) => {
  const { email } = req.body;
  const clientOrigin = req.get('origin');

  if (!email || !/\S+@\S+\.\S+/.test(email)) {
    return res.status(400).json({ message: 'A valid email is required for signup.' });
  }

  if (clientOrigin !==  process.env.DOMAIN_CLIENT) {
    console.log(clientOrigin, process.env.DOMAIN_CLIENT);
    console.log(req.headers);
    return res.status(403).json({ message: 'Origin mismatch.' });
  }

  try {
    const existingUser = await User.findOne({ email: email.toLowerCase() }).exec();
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists.' });
    }

    const userHandle = bufferToBase64url(Buffer.from(uuidv4().replace(/-/g, ''), 'hex'));
    const user = { id: userHandle, name: email.split('@')[0], displayName: email.split('@')[0], email };

    sessionChallengeStore.challenge(req, { user }, (err, challenge) => {
      if (err) {
        return next(err);
      }
      res.json({ user, challenge: bufferToBase64url(challenge) });
    });
  } catch (err) {
    next(err);
  }
});

/* Login Challenge */
router.post('/login/public-key/challenge', (req, res, next) => {
  sessionChallengeStore.challenge(req, (err, challenge) => {
    if (err) {
      return next(err);
    }
    res.json({ challenge: bufferToBase64url(challenge) });
  });
});

/* Signup Final */
router.post(
  '/signup/public-key',
  passport.authenticate('webauthn', { failWithError: true }),
  async (req, res, next) => {
    try {
      await setAuthTokens(req.user._id, res);
      const clientOrigin = req.get('origin');
      console.log(clientOrigin, process.env.DOMAIN_CLIENT);
      console.log(req.headers);
      res.redirect(process.env.DOMAIN_CLIENT);
    } catch (err) {
      next(err);
    }
  },
);

/* Login Final */
router.post(
  '/login/public-key',
  passport.authenticate('webauthn', { failWithError: true }),
  async (req, res, next) => {
    try {
      await setAuthTokens(req.user._id, res);
      res.redirect(process.env.DOMAIN_CLIENT);
    } catch (err) {
      next(err);
    }
  },
);

// const originalOrigin = function(req, options) {
//   options = options || {};
//   var app = req.app;
//   if (app && app.get && app.get('trust proxy')) {
//     options.proxy = true;
//   }
//   var trustProxy = options.proxy;
//
//   var proto = (req.headers['x-forwarded-proto'] || '').toLowerCase()
//     , tls = req.connection.encrypted || (trustProxy && 'https' == proto.split(/\s*,\s*/)[0])
//     , host = (trustProxy && req.headers['x-forwarded-host']) || req.headers.host
//     , protocol = tls ? 'https' : 'http';
//   return protocol + '://' + host;
// };

module.exports = router;