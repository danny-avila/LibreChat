const {
  Strategy: WebAuthnStrategy,
  SessionChallengeStore,
} = require('passport-fido2-webauthn');
const { User } = require('~/models'); // Adjust path to your User model

// Required for storing WebAuthn challenges in the session
const store = new SessionChallengeStore();

/**
 * VERIFY CALLBACK
 * --------------
 * Triggered when a user attempts to log in with an existing passkey:
 *   1) Find the user by credentialId
 *   2) Make sure the user and passkey exist
 *   3) Return the publicKey for final verification
 */
async function verify(credentialId, userHandle, done) {
  try {
    // 1) Look up user who has this passkey
    const user = await User.findOne({
      'passkeys.credentialID': Buffer.from(credentialId),
    });

    if (!user) {
      return done(null, false, { message: 'Invalid key: User not found.' });
    }

    // 2) Extract the specific passkey sub-document
    const passkey = user.passkeys.find((pk) =>
      pk.credentialID.equals(Buffer.from(credentialId)),
    );
    if (!passkey) {
      return done(null, false, { message: 'Invalid key: Passkey record not found.' });
    }

    // OPTIONAL: If you store a user handle in your DB, you can compare it here.
    // For example, if your DB has user.passkeyHandle (a 16-byte buffer):
    //
    // const dbHandle = user.passkeyHandle; // or however you store it
    // if (userHandle && !Buffer.from(userHandle).equals(dbHandle)) {
    //   return done(null, false, { message: 'Invalid key: handle mismatch.' });
    // }

    // Everything checks out
    // Return the user doc + passkey's public key
    return done(null, user, passkey.credentialPublicKey);
  } catch (err) {
    return done(err);
  }
}

/**
 * REGISTER CALLBACK
 * -----------------
 * Triggered when a new passkey is being created:
 *   1) Possibly create a new user or find existing
 *   2) Add passkey info to user's passkeys array
 *   3) Return user doc for finalizing registration
 *
 * The `webauthnUser` object is from your challenge route:
 *   { id, name, displayName }
 */
async function register(webauthnUser, credentialId, publicKey, done) {
  try {
    // Convert base64url handle if needed
    const userHandleBuf = Buffer.from(webauthnUser.id, 'base64url');

    // 1) Look up user by some unique field (e.g. `username` or `email`)
    let user = await User.findOne({ username: webauthnUser.name });

    // 2) If user doesn't exist, create them
    if (!user) {
      user = new User({
        username: webauthnUser.name,
        name: webauthnUser.displayName || webauthnUser.name,
        email: `${webauthnUser.name}@example.com`, // or your real email creation logic
        emailVerified: false,
        provider: 'passkey',
        // passkeyHandle: userHandleBuf, // If you want to store the userHandle specifically
      });
    }

    // 3) Avoid duplicates: Check if passkey credentialId is already in passkeys
    const alreadyExists = user.passkeys.some((pk) =>
      pk.credentialID.equals(Buffer.from(credentialId)),
    );
    if (alreadyExists) {
      // E.g., user re-registering same device
      return done(null, user, { message: 'Passkey credential already exists for this user.' });
    }

    // 4) Push new passkey
    user.passkeys.push({
      credentialID: Buffer.from(credentialId),
      credentialPublicKey: Buffer.from(publicKey),
      counter: 0,
      transports: [],
    });

    // 5) Save user to DB
    await user.save();

    // Return final user doc
    return done(null, user);
  } catch (err) {
    return done(err);
  }
}

// Create the WebAuthn strategy instance
const passkeyStrategy = new WebAuthnStrategy(
  { store },
  verify,
  register,
);

module.exports = passkeyStrategy;
