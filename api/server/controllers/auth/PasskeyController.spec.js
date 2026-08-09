const mockLogger = { warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
const mockGetPasskeyConfig = jest.fn();
const mockIsPasskeyEnabled = jest.fn();
const mockIsEnabled = jest.fn();
const mockCheckEmailConfig = jest.fn();
const mockCreatePasskeyRegistrationOptions = jest.fn();
const mockVerifyPasskeyRegistration = jest.fn();
const mockVerifyPasskeyAuthentication = jest.fn();
const mockCreatePasskey = jest.fn();
const mockDeletePasskey = jest.fn();
const mockRenamePasskey = jest.fn();
const mockGetUserById = jest.fn();
const mockUpdateUser = jest.fn();
const mockRecordPasskeyUse = jest.fn();
const mockFindPasskeysByUser = jest.fn();
const mockCountPasskeysByUser = jest.fn();
const mockFindPasskeyByCredentialId = jest.fn();
const mockCheckBan = jest.fn();

jest.mock('librechat-data-provider', () => {
  const actual = jest.requireActual('librechat-data-provider');
  return {
    ...actual,
    CacheKeys: { ...actual.CacheKeys, PASSKEY_CHALLENGE: 'passkey-challenge' },
  };
});

jest.mock('@librechat/data-schemas', () => ({
  logger: mockLogger,
  MAX_PASSKEYS_PER_USER: 10,
}));
jest.mock('@librechat/api', () => ({
  /** Real helper: the step-up gate must run a genuine bcrypt comparison. */
  comparePassword: jest.requireActual('@librechat/api').comparePassword,
  isEnabled: (...args) => mockIsEnabled(...args),
  checkEmailConfig: (...args) => mockCheckEmailConfig(...args),
  getPasskeyConfig: (...args) => mockGetPasskeyConfig(...args),
  isPasskeyEnabled: (...args) => mockIsPasskeyEnabled(...args),
  defaultPasskeyName: () => 'Passkey',
  createPasskeyRegistrationOptions: (...args) => mockCreatePasskeyRegistrationOptions(...args),
  createPasskeyAuthenticationOptions: jest.fn(),
  verifyPasskeyRegistration: (...args) => mockVerifyPasskeyRegistration(...args),
  verifyPasskeyAuthentication: (...args) => mockVerifyPasskeyAuthentication(...args),
}));
jest.mock('~/models', () => ({
  createPasskey: (...args) => mockCreatePasskey(...args),
  deletePasskey: (...args) => mockDeletePasskey(...args),
  renamePasskey: (...args) => mockRenamePasskey(...args),
  getUserById: (...args) => mockGetUserById(...args),
  updateUser: (...args) => mockUpdateUser(...args),
  recordPasskeyUse: (...args) => mockRecordPasskeyUse(...args),
  findPasskeysByUser: (...args) => mockFindPasskeysByUser(...args),
  countPasskeysByUser: (...args) => mockCountPasskeysByUser(...args),
  findPasskeyByCredentialId: (...args) => mockFindPasskeyByCredentialId(...args),
}));
jest.mock('~/cache', () => ({ getLogStores: () => ({}) }));
jest.mock('~/server/middleware', () => ({
  checkBan: (...args) => mockCheckBan(...args),
}));

const bcrypt = require('bcryptjs');

const {
  listPasskeys,
  updatePasskey,
  removePasskey,
  authenticatePasskey,
  registerPasskeyOptions,
  registerPasskeyVerify,
} = require('./PasskeyController');

const PASSWORD = 'correct horse battery staple';
const PASSWORD_HASH = bcrypt.hashSync(PASSWORD, 10);

function buildRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetPasskeyConfig.mockReturnValue({ rpID: 'localhost' });
  mockIsPasskeyEnabled.mockReturnValue(true);
  mockIsEnabled.mockReturnValue(false);
  mockFindPasskeysByUser.mockResolvedValue([]);
  mockCountPasskeysByUser.mockResolvedValue(0);
  mockCreatePasskeyRegistrationOptions.mockResolvedValue({ challenge: 'chal' });
  mockCheckBan.mockImplementation(async () => {});
  mockGetUserById.mockResolvedValue({ _id: 'u1', password: PASSWORD_HASH });
  mockRecordPasskeyUse.mockResolvedValue(true);
  /** Email configured by default, so the legacy grandfather path stays out of the way. */
  mockCheckEmailConfig.mockReturnValue(true);
});

describe('passkey registration provider enforcement', () => {
  const registrationBody = {
    credential: { id: 'cred-1' },
    name: 'Laptop',
    password: PASSWORD,
  };

  it('issues registration options for a local account', async () => {
    const res = buildRes();
    await registerPasskeyOptions(
      { user: { id: 'u1', provider: 'local' }, body: { password: PASSWORD } },
      res,
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockCreatePasskeyRegistrationOptions).toHaveBeenCalled();
  });

  it.each(['openid', 'google', 'ldap', 'saml', undefined])(
    'rejects registration options for provider %s',
    async (provider) => {
      const res = buildRes();
      await registerPasskeyOptions({ user: { id: 'u1', provider } }, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Passkeys are only available for local accounts',
      });
      expect(mockCreatePasskeyRegistrationOptions).not.toHaveBeenCalled();
    },
  );

  it('rejects registration verification for a non-local account', async () => {
    const res = buildRes();
    await registerPasskeyVerify(
      { user: { id: 'u1', provider: 'openid' }, body: registrationBody },
      res,
    );

    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockVerifyPasskeyRegistration).not.toHaveBeenCalled();
    expect(mockCreatePasskey).not.toHaveBeenCalled();
  });

  it('stores the credential when the account is local', async () => {
    mockVerifyPasskeyRegistration.mockResolvedValue({
      credentialId: 'cred-1',
      publicKey: 'pk',
      counter: 0,
      transports: ['internal'],
      deviceType: 'singleDevice',
      backedUp: false,
    });
    mockFindPasskeyByCredentialId.mockResolvedValue(null);
    mockCreatePasskey.mockResolvedValue({ _id: 'p1', name: 'Laptop', createdAt: new Date() });

    const res = buildRes();
    await registerPasskeyVerify(
      { user: { id: 'u1', provider: 'local' }, body: registrationBody },
      res,
    );

    expect(res.status).toHaveBeenCalledWith(201);
    expect(mockCreatePasskey).toHaveBeenCalled();
  });

  it('returns 409 when create races on a duplicate credentialId', async () => {
    mockVerifyPasskeyRegistration.mockResolvedValue({
      credentialId: 'cred-1',
      publicKey: 'pk',
      counter: 0,
      transports: ['internal'],
      deviceType: 'singleDevice',
      backedUp: false,
    });
    mockFindPasskeyByCredentialId.mockResolvedValue(null);
    mockCreatePasskey.mockRejectedValue(Object.assign(new Error('dup'), { code: 11000 }));

    const res = buildRes();
    await registerPasskeyVerify(
      { user: { id: 'u1', provider: 'local' }, body: registrationBody },
      res,
    );

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({ message: 'This passkey is already registered' });
  });

  it('does not read the account password when the provider check already failed', async () => {
    const res = buildRes();
    await registerPasskeyOptions(
      { user: { id: 'u1', provider: 'openid' }, body: { password: PASSWORD } },
      res,
    );

    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockGetUserById).not.toHaveBeenCalled();
  });

  it('still lists passkeys for a non-local account so a stale credential can be removed', async () => {
    const res = buildRes();
    await listPasskeys({ user: { id: 'u1', provider: 'openid' } }, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ passkeys: [] });
  });
});

describe('passkey authentication provider enforcement', () => {
  const loginReq = (user) => ({
    body: { credential: { id: 'cred-1', response: {} }, sessionId: 'sess-1' },
    user,
  });

  beforeEach(() => {
    mockFindPasskeyByCredentialId.mockResolvedValue({
      user: { toString: () => 'u1' },
      credentialId: 'cred-1',
      publicKey: 'pk',
      counter: 0,
      transports: ['internal'],
    });
    mockVerifyPasskeyAuthentication.mockResolvedValue({ newCounter: 1 });
  });

  it('refuses a credential owned by an SSO-provisioned account', async () => {
    mockGetUserById.mockResolvedValue({ _id: 'u1', provider: 'openid', emailVerified: true });
    const res = buildRes();
    const next = jest.fn();

    await authenticatePasskey(loginReq(), res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: 'Passkey authentication failed' });
    expect(mockRecordPasskeyUse).not.toHaveBeenCalled();
  });

  it('signs in a credential owned by a local account', async () => {
    const user = { _id: 'u1', provider: 'local', emailVerified: true };
    mockGetUserById.mockResolvedValue(user);
    const res = buildRes();
    const next = jest.fn();
    const req = loginReq();

    await authenticatePasskey(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user).toBe(user);
    expect(mockRecordPasskeyUse).toHaveBeenCalledWith('cred-1', 1);
  });

  it('rejects an unverified local account when ALLOW_UNVERIFIED_EMAIL_LOGIN is false', async () => {
    mockIsEnabled.mockReturnValue(false);
    mockGetUserById.mockResolvedValue({
      _id: 'u1',
      provider: 'local',
      emailVerified: false,
    });
    const res = buildRes();
    const next = jest.fn();

    await authenticatePasskey(loginReq(), res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: 'Passkey authentication failed' });
    expect(mockRecordPasskeyUse).not.toHaveBeenCalled();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      '[authenticatePasskey] Rejected unverified email login',
    );
  });

  it('allows an unverified local account when ALLOW_UNVERIFIED_EMAIL_LOGIN is true', async () => {
    mockIsEnabled.mockReturnValue(true);
    const user = { _id: 'u1', provider: 'local', emailVerified: false };
    mockGetUserById.mockResolvedValue(user);
    const res = buildRes();
    const next = jest.fn();
    const req = loginReq();

    await authenticatePasskey(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user).toBe(user);
    expect(mockRecordPasskeyUse).toHaveBeenCalledWith('cred-1', 1);
  });

  it('signs in a verified local account regardless of ALLOW_UNVERIFIED_EMAIL_LOGIN', async () => {
    mockIsEnabled.mockReturnValue(false);
    const user = { _id: 'u1', provider: 'local', emailVerified: true };
    mockGetUserById.mockResolvedValue(user);
    const res = buildRes();
    const next = jest.fn();
    const req = loginReq();

    await authenticatePasskey(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user).toBe(user);
    expect(mockRecordPasskeyUse).toHaveBeenCalledWith('cred-1', 1);
  });

  /**
   * Matches `localStrategy`: an account predating mandatory verification, on a
   * deployment with no email configured, is verified as it signs in. Diverging here
   * would let the password factor in and lock the passkey factor out.
   */
  it('grandfathers a legacy unverified account the way the password flow does', async () => {
    mockIsEnabled.mockReturnValue(false);
    mockCheckEmailConfig.mockReturnValue(false);
    const user = {
      _id: 'u1',
      provider: 'local',
      emailVerified: false,
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
    };
    mockGetUserById.mockResolvedValue(user);
    const res = buildRes();
    const next = jest.fn();

    await authenticatePasskey(loginReq(), res, next);

    expect(mockUpdateUser).toHaveBeenCalledWith('u1', { emailVerified: true });
    expect(next).toHaveBeenCalled();
  });

  it('rejects an assertion that loses the signature counter transition', async () => {
    mockGetUserById.mockResolvedValue({ _id: 'u1', provider: 'local', emailVerified: true });
    mockRecordPasskeyUse.mockResolvedValue(false);
    const res = buildRes();
    const next = jest.fn();
    const req = loginReq();

    await authenticatePasskey(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(req.user).toBeUndefined();
    expect(res.status).toHaveBeenCalledWith(401);
  });
});

describe('passkey authentication ban enforcement', () => {
  const USER_ID = '65f0c1b2c3d4e5f6a7b8c9d0';
  const LOCAL_USER = {
    _id: USER_ID,
    email: 'user@example.com',
    provider: 'local',
    emailVerified: true,
  };

  function buildReq() {
    return {
      body: { credential: { id: 'credential-id', response: {} }, sessionId: 'session-id' },
    };
  }

  beforeEach(() => {
    mockFindPasskeyByCredentialId.mockResolvedValue({
      user: USER_ID,
      credentialId: 'credential-id',
      publicKey: Buffer.from('public-key'),
      counter: 0,
      transports: ['internal'],
    });
    mockVerifyPasskeyAuthentication.mockResolvedValue({ newCounter: 1 });
    mockGetUserById.mockResolvedValue(LOCAL_USER);
    mockRecordPasskeyUse.mockResolvedValue(true);
  });

  it('hands off to the next handler when the account is not banned', async () => {
    const req = buildReq();
    const res = buildRes();
    const next = jest.fn();

    await authenticatePasskey(req, res, next);

    expect(mockCheckBan).toHaveBeenCalledTimes(1);
    expect(req.user).toEqual(LOCAL_USER);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('re-checks the ban with the resolved user', async () => {
    let userAtCheck;
    mockCheckBan.mockImplementation(async (req) => {
      userAtCheck = req.user;
    });
    const req = buildReq();

    await authenticatePasskey(req, buildRes(), jest.fn());

    expect(userAtCheck).toEqual(LOCAL_USER);
  });

  it('does not issue tokens for a user banned by id', async () => {
    mockCheckBan.mockImplementation(async (req, res) => {
      req.banned = true;
      res.status(403).json({ message: 'banned' });
    });
    const req = buildReq();
    const res = buildRes();
    const next = jest.fn();

    await authenticatePasskey(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });
});

describe('passkey registration password confirmation (step-up)', () => {
  const localUser = { id: 'u1', provider: 'local' };
  const credential = { id: 'cred-1' };
  const verified = {
    credentialId: 'cred-1',
    publicKey: 'pk',
    counter: 0,
    transports: ['internal'],
    deviceType: 'singleDevice',
    backedUp: false,
  };

  const optionsReq = (body) => ({ user: localUser, ip: '203.0.113.10', body });
  const verifyReq = (body) => ({
    user: localUser,
    ip: '203.0.113.10',
    body: { credential, name: 'Laptop', ...body },
  });

  beforeEach(() => {
    mockVerifyPasskeyRegistration.mockResolvedValue(verified);
    mockFindPasskeyByCredentialId.mockResolvedValue(null);
    mockCreatePasskey.mockResolvedValue({ _id: 'p1', name: 'Laptop', createdAt: new Date() });
  });

  const rejections = [
    ['a missing password', undefined],
    ['a missing password field', {}],
    ['an empty password', { password: '' }],
    ['a non-string password', { password: 12345 }],
    ['an object password', { password: { $ne: null } }],
    ['a wrong password', { password: 'not the password' }],
  ];

  it.each(rejections)('rejects registration options for %s', async (_label, body) => {
    const res = buildRes();
    await registerPasskeyOptions(optionsReq(body), res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ message: 'Incorrect password' });
    expect(mockCreatePasskeyRegistrationOptions).not.toHaveBeenCalled();
  });

  it.each(rejections)('rejects registration verification for %s', async (_label, body) => {
    const res = buildRes();
    await registerPasskeyVerify(verifyReq(body), res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ message: 'Incorrect password' });
    expect(mockVerifyPasskeyRegistration).not.toHaveBeenCalled();
    expect(mockCreatePasskey).not.toHaveBeenCalled();
  });

  it('rejects an account that has no usable password hash', async () => {
    mockGetUserById.mockResolvedValue({ _id: 'u1' });
    const res = buildRes();

    await registerPasskeyVerify(verifyReq({ password: PASSWORD }), res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ message: 'Incorrect password' });
    expect(mockCreatePasskey).not.toHaveBeenCalled();
  });

  it('answers 500 when the account lookup fails, without minting a credential', async () => {
    mockGetUserById.mockRejectedValue(new Error('mongo down'));
    const res = buildRes();

    await registerPasskeyVerify(verifyReq({ password: PASSWORD }), res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Something went wrong' });
    expect(mockCreatePasskey).not.toHaveBeenCalled();
  });

  it('never answers 401, which the client would turn into a sign-out', async () => {
    const res = buildRes();
    await registerPasskeyOptions(optionsReq({ password: 'wrong' }), res);

    expect(res.status).not.toHaveBeenCalledWith(401);
  });

  it('logs a warning naming the user and request IP on a failed step-up', async () => {
    const res = buildRes();
    await registerPasskeyOptions(optionsReq({ password: 'wrong' }), res);

    expect(mockLogger.warn).toHaveBeenCalledWith(
      '[Passkey] [Registration step-up failed] [User: u1] [Request-IP: 203.0.113.10]',
    );
  });

  it('logs a warning for a failed step-up on the verify step too', async () => {
    const res = buildRes();
    await registerPasskeyVerify(verifyReq({ password: 'wrong' }), res);

    expect(mockLogger.warn).toHaveBeenCalledWith(
      '[Passkey] [Registration step-up failed] [User: u1] [Request-IP: 203.0.113.10]',
    );
  });

  it('reads the password field explicitly, which the schema hides by default', async () => {
    const res = buildRes();
    await registerPasskeyOptions(optionsReq({ password: PASSWORD }), res);

    expect(mockGetUserById).toHaveBeenCalledWith('u1', '+password');
  });

  it('issues registration options once the password matches', async () => {
    const res = buildRes();
    await registerPasskeyOptions(optionsReq({ password: PASSWORD }), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ challenge: 'chal' });
    expect(mockLogger.warn).not.toHaveBeenCalled();
  });

  it('stores the credential once the password matches', async () => {
    const res = buildRes();
    await registerPasskeyVerify(verifyReq({ password: PASSWORD }), res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(mockCreatePasskey).toHaveBeenCalledWith(
      expect.objectContaining({ user: 'u1', credentialId: 'cred-1' }),
    );
    expect(mockLogger.warn).not.toHaveBeenCalled();
  });
});

describe('passkey removal password confirmation (step-up)', () => {
  const localUser = { id: 'u1', provider: 'local' };
  const removeReq = (body, user = localUser) => ({
    user,
    ip: '203.0.113.10',
    params: { passkeyId: 'p1' },
    body,
  });

  beforeEach(() => {
    mockDeletePasskey.mockResolvedValue({ deletedCount: 1 });
  });

  const rejections = [
    ['a missing body', undefined],
    ['a missing password field', {}],
    ['an empty password', { password: '' }],
    ['a non-string password', { password: 12345 }],
    ['an object password', { password: { $ne: null } }],
    ['a wrong password', { password: 'not the password' }],
  ];

  it.each(rejections)('refuses removal for %s', async (_label, body) => {
    const res = buildRes();
    await removePasskey(removeReq(body), res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ message: 'Incorrect password' });
    expect(mockDeletePasskey).not.toHaveBeenCalled();
  });

  it('never answers 401, which the client would turn into a sign-out', async () => {
    const res = buildRes();
    await removePasskey(removeReq({ password: 'wrong' }), res);

    expect(res.status).not.toHaveBeenCalledWith(401);
  });

  it('logs a warning naming the user and request IP on a failed step-up', async () => {
    const res = buildRes();
    await removePasskey(removeReq({ password: 'wrong' }), res);

    expect(mockLogger.warn).toHaveBeenCalledWith(
      '[Passkey] [Deletion step-up failed] [User: u1] [Request-IP: 203.0.113.10]',
    );
  });

  it('answers 500 when the account lookup fails, without deleting', async () => {
    mockGetUserById.mockRejectedValue(new Error('mongo down'));
    const res = buildRes();

    await removePasskey(removeReq({ password: PASSWORD }), res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Something went wrong' });
    expect(mockDeletePasskey).not.toHaveBeenCalled();
  });

  it('reads the password field explicitly, which the schema hides by default', async () => {
    const res = buildRes();
    await removePasskey(removeReq({ password: PASSWORD }), res);

    expect(mockGetUserById).toHaveBeenCalledWith('u1', '+password');
  });

  it('removes the credential once the password matches', async () => {
    const res = buildRes();
    await removePasskey(removeReq({ password: PASSWORD }), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ message: 'Passkey deleted' });
    expect(mockDeletePasskey).toHaveBeenCalledWith('p1', 'u1');
    expect(mockLogger.warn).not.toHaveBeenCalled();
  });

  it('answers 404 for a credential the caller does not own', async () => {
    mockDeletePasskey.mockResolvedValue({ deletedCount: 0 });
    const res = buildRes();

    await removePasskey(removeReq({ password: PASSWORD }), res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: 'Passkey not found' });
  });

  it('removes a stranded credential from an account with no password hash', async () => {
    mockGetUserById.mockResolvedValue({ _id: 'u1' });
    const res = buildRes();

    await removePasskey(removeReq(undefined, { id: 'u1', provider: 'openid' }), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockDeletePasskey).toHaveBeenCalledWith('p1', 'u1');
    expect(mockLogger.warn).not.toHaveBeenCalled();
  });

  it('gates on the password hash and not on the provider', async () => {
    const res = buildRes();

    await removePasskey(removeReq(undefined, { id: 'u1', provider: 'openid' }), res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ message: 'Incorrect password' });
    expect(mockDeletePasskey).not.toHaveBeenCalled();
  });

  it('leaves rename ungated: it grants nothing and removes no login factor', async () => {
    mockRenamePasskey.mockResolvedValue({ _id: 'p1', name: 'Work laptop', createdAt: new Date() });
    const res = buildRes();

    await updatePasskey(
      { user: localUser, params: { passkeyId: 'p1' }, body: { name: 'Work laptop' } },
      res,
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockGetUserById).not.toHaveBeenCalled();
    expect(mockRenamePasskey).toHaveBeenCalledWith('p1', 'u1', 'Work laptop');
  });
});
