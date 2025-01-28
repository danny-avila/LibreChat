const { Strategy: WebAuthnStrategy, SessionChallengeStore } = require('passport-fido2-webauthn');
const { v4: uuidv4 } = require('uuid');
const { base64urlToBuffer, bufferToBase64url } = require('~/utils/encoding');
const { logger } = require('~/config');
const User = require('~/models/User');
const crypto = require('crypto');

const sessionChallengeStore = new SessionChallengeStore();

const webauthnOptions = {
  origin: process.env.DOMAIN_CLIENT, // Update to your app's domain
  store: sessionChallengeStore,
  relyingParty: 'LibreChat', // Name of your app (relying party)
};

const webauthnStrategy = new WebAuthnStrategy(
  webauthnOptions,
  // Verify callback for login
  async (id, userHandle, done, req) => {
    try {
      // Extract and verify the origin
      const clientOrigin = JSON.parse(
        Buffer.from(req.body.response.clientDataJSON, 'base64').toString('utf8'),
      ).origin;

      if (clientOrigin !== webauthnOptions.origin) {
        logger.warn('Origin mismatch:', { expected: webauthnOptions.origin, received: clientOrigin });
        return done(null, false, { message: 'Origin mismatch.' });
      }

      const credentialIdBuffer = base64urlToBuffer(id);
      logger.info('Received credential ID:', id);

      const user = await User.findOne({ 'passkeys.credentialID': credentialIdBuffer }).exec();
      if (!user) {
        logger.warn('No user found for given credential ID:', id);
        return done(null, false, { message: 'Invalid credentials.' });
      }

      if (user.webauthnUserHandle !== userHandle) {
        logger.warn('User handle mismatch:', {
          expected: user.webauthnUserHandle,
          received: userHandle,
        });
        return done(null, false, { message: 'Invalid credentials.' });
      }

      const passkey = user.passkeys.find((pk) => pk.credentialID.equals(credentialIdBuffer));
      if (!passkey) {
        logger.warn('Passkey not found for user:', {
          credentialID: id,
          userId: user._id,
        });
        return done(null, false, { message: 'Passkey not found.' });
      }

      // Successful authentication
      done(null, user, { publicKey: passkey.credentialPublicKey, counter: passkey.counter });
    } catch (err) {
      logger.error('Error in WebAuthn login verification:', { error: err.message });
      done(err);
    }
  },
  // Verify callback for registration
  async (webauthnUser, id, publicKey, done, req) => {
    try {
      const clientOrigin = JSON.parse(
        Buffer.from(req.body.response.clientDataJSON, 'base64').toString('utf8'),
      ).origin;

      console.log('Client origin:', clientOrigin);

      if (clientOrigin !== webauthnOptions.origin) {
        logger.warn('Origin mismatch:', { expected: webauthnOptions.origin, received: clientOrigin });
        return done(null, false, { message: 'Origin mismatch.' });
      }

      const { email, displayName } = webauthnUser;
      const credentialIdBuffer = base64urlToBuffer(id);
      const publicKeyBuffer = base64urlToBuffer(publicKey);

      let user = await User.findOne({ email: email.toLowerCase() }).exec();
      if (!user) {
        const userHandle = bufferToBase64url(Buffer.from(uuidv4().replace(/-/g, ''), 'hex'));
        user = new User({
          name: email.split('@')[0],
          email: email.toLowerCase(),
          username: email.split('@')[0],
          webauthnUserHandle: userHandle,
          passkeys: [],
        });
        await user.save();
      }

      if (user.passkeys.some((pk) => pk.credentialID.equals(credentialIdBuffer))) {
        logger.warn('Duplicate passkey detected during registration:', { credentialID: id });
        return done(null, false, { message: 'Passkey already exists.' });
      }

      user.passkeys.push({
        credentialID: credentialIdBuffer,
        credentialPublicKey: publicKeyBuffer,
        counter: 0,
      });
      await user.save();

      done(null, user);
    } catch (err) {
      logger.error('Error during WebAuthn registration:', { error: err.message });
      done(err);
    }
  },
);

// sessionChallengeStore.challenge = (req, user, cb) => {
//   const challenge = crypto.randomBytes(32);
//   req.session.challenge = challenge.toString('base64url'); // Save as Base64 URL string
//   logger.info('Challenge set:', { challenge: req.session.challenge });
//   cb(null, challenge);
// };
//
// sessionChallengeStore.verify = (req, challenge, cb) => {
//   const storedChallenge = req.session.challenge;
//
//   console.log('Stored challenge:', storedChallenge);
//   console.log('Received challenge:', challenge.toString('base64url'));
//
//   // Ensure stored challenge matches the received challenge
//   if (!storedChallenge || storedChallenge !== challenge.toString('base64url')) {
//     logger.warn('Challenge verification failed.');
//     return cb(new Error('Challenge verification failed.'));
//   }
//
//   // Clear the challenge after successful verification
//   delete req.session.challenge;
//   cb(null);
// };

module.exports = { webauthnStrategy, sessionChallengeStore };