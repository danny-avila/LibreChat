const { Strategy: WebAuthnStrategy } = require('passport-fido2-webauthn');
const { sessionChallengeStore } = require('~/cache');
const { createUser } = require('~/models/userMethods');
const { logger } = require('~/config');
const User = require('~/models/User');

/* Helper Functions */
function base64urlToBase64(base64urlString) {
  return base64urlString
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(base64urlString.length + (4 - (base64urlString.length % 4)) % 4, '=');
}

function base64ToBuffer(base64String) {
  return Buffer.from(base64String, 'base64');
}

/** VERIFY (Login) */
async function verify(id, userHandle, cb) {
  logger.debug('Verify function called', { id, userHandle });

  try {
    // Decode credentialId and userHandle
    const base64CredentialId = base64urlToBase64(id);
    const decodedCredentialId = base64ToBuffer(base64CredentialId);
    const decodedUserHandle = userHandle ? base64ToBuffer(base64urlToBase64(userHandle)) : null;

    logger.debug('Decoded credentialId and userHandle', {
      decodedCredentialId: decodedCredentialId.toString('hex'),
      decodedUserHandle: decodedUserHandle ? decodedUserHandle.toString('hex') : null,
    });

    // Build query based on userHandle
    const query = decodedUserHandle
      ? {
        webauthnUserHandle: decodedUserHandle,
        'passkeys.credentialID': decodedCredentialId,
      }
      : { 'passkeys.credentialID': decodedCredentialId };

    // Find user using the User model directly (non-lean)
    const user = await User.findOne(query).exec();

    if (!user) {
      logger.warn('Verification failed: User not found', { id, userHandle });
      return cb(null, false, { message: 'Invalid key: User not found.' });
    }

    // Find corresponding passkey
    const passkey = user.passkeys.find(pk =>
      pk.credentialID.equals(decodedCredentialId),
    );

    if (!passkey) {
      logger.warn('Verification failed: Passkey record not found', { id, userId: user._id });
      return cb(null, false, { message: 'Invalid key: Passkey record not found.' });
    }

    logger.info('Credentials verified successfully', { userId: user._id, id });

    // Prepare options for assertion verification
    const options = {
      publicKey: passkey.credentialPublicKey,
      counter: passkey.counter,
    };

    return cb(null, user, options);
  } catch (err) {
    logger.error('Error during credential verification', { error: err, id, userHandle });
    return cb(err);
  }
}

/** REGISTER (Signup) */
async function register(webauthnUser, id, publicKey, cb) {
  logger.debug('Register function called', { webauthnUser, id, publicKey });

  try {
    const { username, displayName, email } = webauthnUser;

    if (!email) {
      logger.warn('Registration failed: Email is required', { webauthnUser });
      return cb(null, false, { message: 'Email is required for registration.' });
    }

    // Attempt to find the user using the User model directly (non-lean)
    let user = await User.findOne({ email: email.toLowerCase() }).exec();

    if (user) {
      logger.info('User already exists, adding new passkey', { userId: user._id });
    } else {
      // Create a new user
      const newUserId = await createUser({
        username: username ? username.toLowerCase() : email.split('@')[0].toLowerCase(),
        name: displayName || username || email.split('@')[0],
        email: email.toLowerCase(),
        provider: 'passkey',
        emailVerified: false,
      }, true, false);

      logger.debug('New user ID returned from createUser', { newUserId });

      // Retrieve the newly created user as a Mongoose document
      user = await User.findById(newUserId).exec();

      if (!user) {
        logger.error('Failed to retrieve newly created user document', { newUserId });
        return cb(null, false, { message: 'User creation failed.' });
      }

      logger.info('New user created via passkey registration', { userId: user._id });
    }

    // Decode credentialId and publicKey
    const base64CredentialId = base64urlToBase64(id);
    const decodedCredentialId = base64ToBuffer(base64CredentialId);

    const base64PublicKey = base64urlToBase64(publicKey);
    const decodedPublicKey = base64ToBuffer(base64PublicKey);

    logger.debug('Decoded credentialID and publicKey', {
      decodedCredentialId: decodedCredentialId.toString('hex'),
      decodedPublicKey: decodedPublicKey.toString('hex'),
    });

    // Check for duplicate passkey
    const existingPasskey = user.passkeys.find(pk =>
      pk.credentialID.equals(decodedCredentialId),
    );

    if (existingPasskey) {
      logger.warn('Passkey credential already exists for user', { userId: user._id, id });
      return cb(null, false, { message: 'Passkey credential already exists.' });
    }

    // Create new passkey object
    const newPasskey = {
      credentialID: decodedCredentialId,
      credentialPublicKey: decodedPublicKey,
      counter: 0,
      transports: [], // Populate if necessary
    };

    // Add the new passkey to the user's passkeys array
    user.passkeys.push(newPasskey);
    logger.debug('Added new passkey to user', { userId: user._id, newPasskey });

    // Decode userHandle and store it if not already set
    if (!user.webauthnUserHandle && webauthnUser.id) {
      const userHandleBuffer = base64ToBuffer(base64urlToBase64(webauthnUser.id));
      logger.debug('Decoded userHandle', { userHandleBuffer: userHandleBuffer.toString('hex') });
      user.webauthnUserHandle = userHandleBuffer;
    }

    // Save the user with the new passkey
    await user.save();
    logger.info('New passkey registered and associated with user', { userId: user._id, id });

    // Prepare options for assertion verification
    const options = {
      publicKey: newPasskey.credentialPublicKey,
      counter: newPasskey.counter,
    };

    return cb(null, user, options);
  } catch (err) {
    logger.error('Error during passkey registration', { error: err, webauthnUser, id });
    return cb(err);
  }
}

// Initialize the WebAuthnStrategy with SessionChallengeStore
const strategy = new WebAuthnStrategy({ store: sessionChallengeStore }, verify, register);

// Log strategy initialization
logger.info('WebAuthnStrategy initialized with SessionChallengeStore');

module.exports = strategy;
