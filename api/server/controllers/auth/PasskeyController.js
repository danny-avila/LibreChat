const bcrypt = require('bcryptjs');
const { CacheKeys } = require('librechat-data-provider');
const { logger, MAX_PASSKEYS_PER_USER } = require('@librechat/data-schemas');
const {
  isEnabled,
  comparePassword,
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
  updateUser,
  recordPasskeyUse,
  findPasskeysByUser,
  countPasskeysByUser,
  findPasskeyByCredentialId,
} = require('~/models');
const { checkBan } = require('~/server/middleware');
const { getLogStores } = require('~/cache');

const MAX_PASSKEY_NAME_LENGTH = 60;
const LOCAL_PROVIDER = 'local';
/** Single answer for every step-up failure so the endpoint reveals nothing extra. */
const INCORRECT_PASSWORD = 'Incorrect password';
/** Log tags keep the two step-up sites distinguishable in the audit trail. */
const REGISTRATION_STEP_UP = 'Registration step-up failed';
const DELETION_STEP_UP = 'Deletion step-up failed';

/**
 * Challenge store with getDel so consumeChallenge prefers an atomic pop path.
 * Keyv itself is get-then-delete under the hood unless the adapter exposes getDel;
 * wrapping here keeps the ceremony helpers on the preferred API surface.
 */
const getChallengeStore = () => {
  const cache = getLogStores(CacheKeys.PASSKEY_CHALLENGE);
  return {
    get: (key) => cache.get(key),
    set: (key, value, ttl) => cache.set(key, value, ttl),
    delete: (key) => cache.delete(key),
    getDel: async (key) => {
      if (typeof cache.getDel === 'function') {
        return cache.getDel(key);
      }
      const value = await cache.get(key);
      if (value === undefined || value === null) {
        return undefined;
      }
      await cache.delete(key);
      return value;
    },
  };
};

/**
 * Passkeys are a local-account credential. An account provisioned by an identity
 * provider must keep authenticating through it, otherwise the passkey becomes a
 * login path that bypasses IdP-side MFA, conditional access and deprovisioning.
 */
const isLocalAccount = (user) => user?.provider === LOCAL_PROVIDER;

/** Responds 403 when the authenticated account is not a local one. */
const requireLocalAccount = (req, res) => {
  if (isLocalAccount(req.user)) {
    return true;
  }
  res.status(403).json({ message: 'Passkeys are only available for local accounts' });
  return false;
};

/**
 * Answers a failed step-up. The rejection is logged because these endpoints would
 * otherwise be a silent password oracle for a stolen access token: they are keyed
 * by user id rather than by IP, so the login ban system never sees these attempts.
 */
const denyPasswordConfirmation = (req, res, tag) => {
  logger.warn(`[Passkey] [${tag}] [User: ${req.user?.id}] [Request-IP: ${req.ip}]`);
  res.status(403).json({ message: INCORRECT_PASSWORD });
  return false;
};

/**
 * Step-up gate shared by the passkey endpoints that add or remove a login factor.
 * A passkey is a durable single-factor login that outlives session revocation, so
 * minting one, or stripping one the account relies on, takes the account password
 * and not merely a bearer token.
 *
 * Answers 403 rather than 401 on failure: the client turns a 401 into a token
 * refresh followed by a redirect to the login page, so a mistyped password would
 * sign the user out instead of showing an error.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {object} options
 * @param {string} options.tag Log tag naming the step-up site.
 * @param {boolean} [options.allowPasswordless] Pass when an account carrying no
 * password hash should be waved through instead of refused.
 * @returns {Promise<boolean>} true when the caller may continue
 */
const requirePasswordConfirmation = async (req, res, { tag, allowPasswordless = false }) => {
  const password = req.body?.password;
  const submitted = typeof password === 'string' && password.length > 0;

  if (!submitted && !allowPasswordless) {
    return denyPasswordConfirmation(req, res, tag);
  }

  let account;
  try {
    account = await getUserById(req.user.id, '+password');
  } catch (err) {
    logger.error('[requirePasswordConfirmation]', err);
    res.status(500).json({ message: 'Something went wrong' });
    return false;
  }

  if (!account?.password) {
    return allowPasswordless ? true : denyPasswordConfirmation(req, res, tag);
  }

  if (!submitted) {
    return denyPasswordConfirmation(req, res, tag);
  }

  const isMatch = await comparePassword(account, password, { compare: bcrypt.compare }).catch(
    (err) => {
      logger.error('[requirePasswordConfirmation]', err);
      return false;
    },
  );

  if (!isMatch) {
    return denyPasswordConfirmation(req, res, tag);
  }

  return true;
};

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

  if (!requireLocalAccount(req, res)) {
    return;
  }

  if (!(await requirePasswordConfirmation(req, res, { tag: REGISTRATION_STEP_UP }))) {
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

/**
 * Verifies an attestation and stores the credential against the authenticated user.
 *
 * The step-up is repeated here rather than only on the options step because
 * `createPasskey` is the durable write, and gating only the challenge would leave
 * the write path itself uncontrolled.
 */
const registerPasskeyVerify = async (req, res) => {
  const config = requirePasskeysEnabled(res);
  if (!config) {
    return;
  }

  if (!requireLocalAccount(req, res)) {
    return;
  }

  if (!(await requirePasswordConfirmation(req, res, { tag: REGISTRATION_STEP_UP }))) {
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
    if (err?.code === 11000 || err?.code === 'E11000') {
      return res.status(409).json({ message: 'This passkey is already registered' });
    }
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

/**
 * Removes one of the authenticated user's passkeys.
 *
 * Password-confirmed for the same reason enrollment is: a stolen access token
 * must not be able to strip a login factor the account still depends on.
 *
 * The gate is skipped for an account carrying no password hash. That looks like a
 * hole and is not one. An SSO or LDAP account can never satisfy a password gate,
 * and a passkey enrolled on one before the provider check existed would otherwise
 * be stranded with no UI or API able to remove it. Allowing the removal grants an
 * attacker nothing either: `authenticatePasskey` already refuses a credential
 * whose owner is not a local account, so it is not a usable sign-in factor.
 */
const removePasskey = async (req, res) => {
  if (!requirePasskeysEnabled(res)) {
    return;
  }

  if (
    !(await requirePasswordConfirmation(req, res, {
      tag: DELETION_STEP_UP,
      allowPasswordless: true,
    }))
  ) {
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

    if (!isLocalAccount(user)) {
      logger.warn(
        '[authenticatePasskey] Rejected a passkey belonging to a non-local account; the identity provider must be used',
      );
      return failure();
    }

    const unverifiedAllowed = isEnabled(process.env.ALLOW_UNVERIFIED_EMAIL_LOGIN);
    if (user.expiresAt && unverifiedAllowed) {
      await updateUser(user._id || user.id, {});
    }
    if (!user.emailVerified && !unverifiedAllowed) {
      logger.warn('[authenticatePasskey] Rejected unverified email login');
      return failure();
    }

    await recordPasskeyUse(passkey.credentialId, result.newCounter);

    req.user = user;

    await checkBan(req, res);
    if (req.banned) {
      return;
    }

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
