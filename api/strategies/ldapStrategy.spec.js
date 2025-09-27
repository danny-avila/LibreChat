// --- Mocks ---
jest.mock('@librechat/data-schemas', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('@librechat/api', () => ({
  // isEnabled used for TLS flags
  isEnabled: jest.fn(() => false),
  isEmailDomainAllowed: jest.fn(() => true),
  getBalanceConfig: jest.fn(() => ({ enabled: false })),
}));

jest.mock('~/models', () => ({
  findUser: jest.fn(),
  createUser: jest.fn(),
  updateUser: jest.fn(),
  countUsers: jest.fn(),
}));

jest.mock('~/server/services/Config', () => ({
  getAppConfig: jest.fn().mockResolvedValue({}),
}));

// Mock passport-ldapauth to capture verify callback
let verifyCallback;
jest.mock('passport-ldapauth', () => {
  return jest.fn().mockImplementation((options, verify) => {
    verifyCallback = verify; // capture the strategy verify function
    return { name: 'ldap', options, verify };
  });
});

const { ErrorTypes } = require('librechat-data-provider');
const { isEmailDomainAllowed } = require('@librechat/api');
const { findUser, createUser, updateUser, countUsers } = require('~/models');

// Helper to call the verify callback and wrap in a Promise for convenience
const callVerify = (userinfo) =>
  new Promise((resolve, reject) => {
    verifyCallback(userinfo, (err, user, info) => {
      if (err) return reject(err);
      resolve({ user, info });
    });
  });

describe('ldapStrategy', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // minimal required env for ldapStrategy module to export
    process.env.LDAP_URL = 'ldap://example.com';
    process.env.LDAP_USER_SEARCH_BASE = 'ou=users,dc=example,dc=com';

    // Unset optional envs to exercise defaults
    delete process.env.LDAP_CA_CERT_PATH;
    delete process.env.LDAP_FULL_NAME;
    delete process.env.LDAP_ID;
    delete process.env.LDAP_USERNAME;
    delete process.env.LDAP_EMAIL;
    delete process.env.LDAP_TLS_REJECT_UNAUTHORIZED;
    delete process.env.LDAP_STARTTLS;

    // Default model/domain mocks
    findUser.mockReset().mockResolvedValue(null);
    createUser.mockReset().mockResolvedValue('newUserId');
    updateUser.mockReset().mockImplementation(async (id, user) => ({ _id: id, ...user }));
    countUsers.mockReset().mockResolvedValue(0);
    isEmailDomainAllowed.mockReset().mockReturnValue(true);

    // Ensure requiring the strategy sets up the verify callback
    jest.isolateModules(() => {
      require('./ldapStrategy');
    });
  });

  it('uses the first email when LDAP returns multiple emails (array)', async () => {
    const userinfo = {
      uid: 'uid123',
      givenName: 'Alice',
      cn: 'Alice Doe',
      mail: ['first@example.com', 'second@example.com'],
    };

    const { user } = await callVerify(userinfo);

    expect(user.email).toBe('first@example.com');
    expect(createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'ldap',
        ldapId: 'uid123',
        username: 'Alice',
        email: 'first@example.com',
        emailVerified: true,
        name: 'Alice Doe',
      }),
      expect.any(Object),
    );
  });

  it('blocks login if an existing user has a different provider', async () => {
    findUser.mockResolvedValue({ _id: 'u1', email: 'first@example.com', provider: 'google' });

    const userinfo = {
      uid: 'uid123',
      mail: 'first@example.com',
      givenName: 'Alice',
      cn: 'Alice Doe',
    };

    const { user, info } = await callVerify(userinfo);

    expect(user).toBe(false);
    expect(info).toEqual({ message: ErrorTypes.AUTH_FAILED });
    expect(createUser).not.toHaveBeenCalled();
  });

  it('updates an existing ldap user with current LDAP info', async () => {
    const existing = {
      _id: 'u2',
      provider: 'ldap',
      email: 'old@example.com',
      ldapId: 'uid123',
      username: 'olduser',
      name: 'Old Name',
    };
    findUser.mockResolvedValue(existing);

    const userinfo = {
      uid: 'uid123',
      mail: 'new@example.com',
      givenName: 'NewFirst',
      cn: 'NewFirst NewLast',
    };

    const { user } = await callVerify(userinfo);

    expect(createUser).not.toHaveBeenCalled();
    expect(updateUser).toHaveBeenCalledWith(
      'u2',
      expect.objectContaining({
        provider: 'ldap',
        ldapId: 'uid123',
        email: 'new@example.com',
        username: 'NewFirst',
        name: 'NewFirst NewLast',
      }),
    );
    expect(user.email).toBe('new@example.com');
  });

  it('falls back to username@ldap.local when no email attributes are present', async () => {
    const userinfo = {
      uid: 'uid999',
      givenName: 'John',
      cn: 'John Doe',
      // no mail and no custom LDAP_EMAIL
    };

    const { user } = await callVerify(userinfo);

    expect(user.email).toBe('John@ldap.local');
  });

  it('denies login if email domain is not allowed', async () => {
    isEmailDomainAllowed.mockReturnValue(false);

    const userinfo = {
      uid: 'uid123',
      mail: 'notallowed@blocked.com',
      givenName: 'Alice',
      cn: 'Alice Doe',
    };

    const { user, info } = await callVerify(userinfo);
    expect(user).toBe(false);
    expect(info).toEqual({ message: 'Email domain not allowed' });
  });
});
