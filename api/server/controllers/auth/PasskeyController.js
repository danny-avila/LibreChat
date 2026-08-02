const { CacheKeys } = require('librechat-data-provider');
const { logger, MAX_PASSKEYS_PER_USER } = require('@librechat/data-schemas');
const {
  getPasskeyConfig,
  isPasskeyEnabled,
  defaultPasskeyName,
  createPasskeyRegistrationOptions,
  createPasskeyAuthenticationOptions,
  verifyPasskeyRegistration,
  verifyPasskeyAuthentication,
} = require('@librechat/api');
const {
  createPasskey,
  deletePasskey,
  renamePasskey,
  getUserById,
  recordPasskeyUse,
  findPasskeysByUser,
  countPasskeysByUser,
  findPasskeyByCredentialId,
} = require('~/models');
const { getLogStores } = require('~/cache');

const MAX_PASSKEY_NAME_LENGTH = 60;

const getChallengeStore = () => getLogStores(CacheKeys.PASSKEY_CHALLENGE);

/** Shapes a stored credential into the safe summary the client renders. */
const serializePasskey = (passkey) => ({
  id: passkey._id.toString(),
  name: passkey.name,
  deviceType: passkey.deviceType,
  backedUp: passkey.backedUp,
  transports: passkey.transports ?? [],
  createdAt: passkey.createdAt,
  lastUsedAt: passkey.lastUsedAt ?? null,
});

/**
 * Guard shared by every passkey endpoint. Responds 404 when the feature is off
 * so a disabled deployment does not advertise the routes.
 */
const requirePasskeysEnabled = (res) => {
  const config = getPasskeyConfig();
  if (!isPasskeyEnabled(config)) {
    res.status(404).json({ message: 'Passkey authentication is not enabled' });
    return null;
  }
  return config;
};

/** Lists the authenticated user's registered passkeys. */
const listPasskeys = async (req, res) => {
  if (!requirePasskeysEnabled(res)) {
    return;
  }

  try {
    const passkeys = await findPasskeysByUser(req.user.id);
    return res.status(200).json({ passkeys: passkeys.map(serializePasskey) });
  } catch (err) {
    logger.error('[listPasskeys]', err);
    return res.status(500).json({ message: 'Something went wrong' });
  }
};

/** Issues a registration challenge for the authenticated user. */
const registerPasskeyOptions = async (req, res) => {
  const config = requirePasskeysEnabled(res);
  if (!config) {
    return;
  }

  try {
    const existingCredentials = await findPasskeysByUser(req.user.id);
    if (existingCredentials.length >= MAX_PASSKEYS_PER_USER) {
      return res.status(409).json({ message: 'Passkey limit reached' });
    }

    const options = await createPasskeyRegistrationOptions({
      config,
      store: getChallengeStore(),
      user: {
        id: req.user.id,
        email: req.user.email,
        name: req.user.name,
        username: req.user.username,
      },
      existingCredentials,
    });

    return res.status(200).json(options);
  } catch (err) {
    logger.error('[registerPasskeyOptions]', err);
    return res.status(500).json({ message: 'Something went wrong' });
  }
};

/** Verifies an attestation and stores the credential against the authenticated user. */
const registerPasskeyVerify = async (req, res) => {
  const config = requirePasskeysEnabled(res);
  if (!config) {
    return;
  }

  try {
    const { credential, name } = req.body ?? {};
    if (!credential || typeof credential !== 'object') {
      return res.status(400).json({ message: 'Missing credential' });
    }

    if ((await countPasskeysByUser(req.user.id)) >= MAX_PASSKEYS_PER_USER) {
      return res.status(409).json({ message: 'Passkey limit reached' });
    }

    const verified = await verifyPasskeyRegistration({
      config,
      store: getChallengeStore(),
      userId: req.user.id,
      response: credential,
    });

    if (!verified) {
      return res.status(400).json({ message: 'Passkey registration could not be verified' });
    }

    if (await findPasskeyByCredentialId(verified.credentialId)) {
      return res.status(409).json({ message: 'This passkey is already registered' });
    }

    const trimmedName = typeof name === 'string' ? name.trim() : '';
    const passkey = await createPasskey({
      user: req.user.id,
      credentialId: verified.credentialId,
      publicKey: verified.publicKey,
      counter: verified.counter,
      transports: verified.transports,
      deviceType: verified.deviceType,
      backedUp: verified.backedUp,
      name:
        trimmedName.slice(0, MAX_PASSKEY_NAME_LENGTH) || defaultPasskeyName(verified.transports),
    });

    return res.status(201).json({ passkey: serializePasskey(passkey) });
  } catch (err) {
    logger.error('[registerPasskeyVerify]', err);
    return res.status(500).json({ message: 'Something went wrong' });
  }
};

/** Renames one of the authenticated user's passkeys. */
const updatePasskey = async (req, res) => {
  if (!requirePasskeysEnabled(res)) {
    return;
  }

  try {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    if (!name) {
      return res.status(400).json({ message: 'Name is required' });
    }

    const passkey = await renamePasskey(
      req.params.passkeyId,
      req.user.id,
      name.slice(0, MAX_PASSKEY_NAME_LENGTH),
    );

    if (!passkey) {
      return res.status(404).json({ message: 'Passkey not found' });
    }

    return res.status(200).json({ passkey: serializePasskey(passkey) });
  } catch (err) {
    logger.error('[updatePasskey]', err);
    return res.status(500).json({ message: 'Something went wrong' });
  }
};

/** Removes one of the authenticated user's passkeys. */
const removePasskey = async (req, res) => {
  if (!requirePasskeysEnabled(res)) {
    return;
  }

  try {
    const result = await deletePasskey(req.params.passkeyId, req.user.id);
    if (!result?.deletedCount) {
      return res.status(404).json({ message: 'Passkey not found' });
    }
    return res.status(200).json({ message: 'Passkey deleted' });
  } catch (err) {
    logger.error('[removePasskey]', err);
    return res.status(500).json({ message: 'Something went wrong' });
  }
};

/**
 * Issues an authentication challenge to an anonymous caller. No credential list
 * is returned, so the response is identical whether or not an account exists.
 */
const loginPasskeyOptions = async (req, res) => {
  const config = requirePasskeysEnabled(res);
  if (!config) {
    return;
  }

  try {
    const { options, sessionId } = await createPasskeyAuthenticationOptions({
      config,
      store: getChallengeStore(),
    });
    return res.status(200).json({ options, sessionId });
  } catch (err) {
    logger.error('[loginPasskeyOptions]', err);
    return res.status(500).json({ message: 'Something went wrong' });
  }
};

/** Base64URL-decodes the assertion's user handle so it can be matched to the credential owner. */
const decodeUserHandle = (userHandle) => {
  if (typeof userHandle !== 'string' || !userHandle) {
    return null;
  }
  try {
    return Buffer.from(userHandle, 'base64url').toString('utf8');
  } catch {
    return null;
  }
};

/**
 * Verifies an assertion and, on success, populates `req.user` with the
 * credential's owner. Handing off to the shared `loginController` keeps passkey
 * sign-in identical to password sign-in for 2FA gating and token issuance.
 */
const authenticatePasskey = async (req, res, next) => {
  const config = requirePasskeysEnabled(res);
  if (!config) {
    return;
  }

  const failure = () => res.status(401).json({ message: 'Passkey authentication failed' });

  try {
    const { credential, sessionId } = req.body ?? {};
    if (!credential || typeof credential !== 'object' || typeof sessionId !== 'string') {
      return res.status(400).json({ message: 'Missing credential' });
    }

    const passkey = await findPasskeyByCredentialId(credential.id);
    if (!passkey) {
      return failure();
    }

    const userHandle = decodeUserHandle(credential.response?.userHandle);
    if (userHandle && userHandle !== passkey.user.toString()) {
      logger.warn('[authenticatePasskey] User handle does not match the credential owner');
      return failure();
    }

    const result = await verifyPasskeyAuthentication({
      config,
      store: getChallengeStore(),
      sessionId,
      response: credential,
      credential: {
        credentialId: passkey.credentialId,
        publicKey: passkey.publicKey,
        counter: passkey.counter,
        transports: passkey.transports,
      },
    });

    if (!result) {
      return failure();
    }

    const user = await getUserById(passkey.user.toString());
    if (!user) {
      return failure();
    }

    await recordPasskeyUse(passkey.credentialId, result.newCounter);

    req.user = user;
    return next();
  } catch (err) {
    logger.error('[authenticatePasskey]', err);
    return res.status(500).json({ message: 'Something went wrong' });
  }
};

module.exports = {
  listPasskeys,
  updatePasskey,
  removePasskey,
  authenticatePasskey,
  loginPasskeyOptions,
  registerPasskeyOptions,
  registerPasskeyVerify,
};
