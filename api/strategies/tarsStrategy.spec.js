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
  authenticateTars: jest.fn(),
  isEmailDomainAllowed: jest.fn(() => true),
  getBalanceConfig: jest.fn(() => ({ enabled: false })),
  resolveAppConfigForUser: jest.fn(async () => ({})),
  isTarsAdminRole: jest.fn(
    (roleId, adminRoleIds = [1]) => roleId != null && adminRoleIds.includes(roleId),
  ),
  flattenTarsMenuKeys: jest.fn((items) => items.map((item) => item.dom_id).filter(Boolean)),
}));

jest.mock('~/models', () => ({
  findUser: jest.fn(),
  createUser: jest.fn(),
  updateUser: jest.fn(),
}));

jest.mock('~/server/services/Config', () => ({
  getAppConfig: jest.fn().mockResolvedValue({}),
}));

// Mock passport-local to capture the verify callback
let verifyCallback;
jest.mock('passport-local', () => ({
  Strategy: jest.fn().mockImplementation((options, verify) => {
    verifyCallback = verify;
    return { name: 'tars', options, verify };
  }),
}));

process.env.TARS_AUTH_URL = 'http://localhost:5000';

const { ErrorTypes } = require('librechat-data-provider');
const { authenticateTars, isEmailDomainAllowed } = require('@librechat/api');
const { findUser, createUser, updateUser } = require('~/models');

// Load once so the verify callback is captured against our persistent mocks
require('./tarsStrategy');

const callVerify = (username, password) =>
  new Promise((resolve, reject) => {
    verifyCallback(username, password, (err, user, info) => {
      if (err) return reject(err);
      resolve({ user, info });
    });
  });

const adminTarsUser = {
  id: 'tars-uuid-1',
  username: 'jdoe',
  email: 'jdoe@example.com',
  name: 'John Doe',
  status: 'active',
  roleId: 1,
  groupIds: 'g1,g2',
  menuItems: [{ id: 100, dom_id: 'chat-application', url: '/dashboard' }],
};

const guestTarsUser = { ...adminTarsUser, roleId: 99 };

describe('tarsStrategy', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    findUser.mockReset().mockResolvedValue(null);
    createUser.mockReset().mockResolvedValue('newUserId');
    updateUser.mockReset().mockImplementation(async (id, user) => ({ _id: id, ...user }));
    isEmailDomainAllowed.mockReset().mockReturnValue(true);
    authenticateTars.mockReset();
  });

  it('rejects with AUTH_FAILED when pwc_tars returns null', async () => {
    authenticateTars.mockResolvedValue(null);
    const { user, info } = await callVerify('jdoe', 'wrong');
    expect(user).toBe(false);
    expect(info.message).toBe(ErrorTypes.AUTH_FAILED);
    expect(createUser).not.toHaveBeenCalled();
  });

  it('creates a shadow user with mapped ADMIN role and stores the tars context', async () => {
    authenticateTars.mockResolvedValue(adminTarsUser);

    const { user } = await callVerify('jdoe', 'secret');

    expect(createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'tars',
        tarsId: 'tars-uuid-1',
        username: 'jdoe',
        email: 'jdoe@example.com',
        role: 'ADMIN',
        emailVerified: true,
        tarsStatus: 'active',
        tarsRoleId: 1,
        tarsGroupIds: 'g1,g2',
        tarsMenuItems: adminTarsUser.menuItems,
        tarsMenuKeys: ['chat-application'],
      }),
      expect.anything(),
    );
    expect(user._id).toBe('newUserId');
  });

  it('maps a non-admin role_id to USER', async () => {
    authenticateTars.mockResolvedValue(guestTarsUser);

    await callVerify('jdoe', 'secret');

    expect(createUser).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'USER', tarsRoleId: 99 }),
      expect.anything(),
    );
  });

  it('updates an existing tars user and re-applies pwc_tars role (governance)', async () => {
    authenticateTars.mockResolvedValue(guestTarsUser);
    findUser.mockResolvedValue({
      _id: 'existing-id',
      provider: 'tars',
      tarsId: 'tars-uuid-1',
      role: 'ADMIN',
    });

    await callVerify('jdoe', 'secret');

    expect(createUser).not.toHaveBeenCalled();
    expect(updateUser).toHaveBeenCalledWith(
      'existing-id',
      expect.objectContaining({
        provider: 'tars',
        tarsId: 'tars-uuid-1',
        email: 'jdoe@example.com',
        role: 'USER',
        tarsRoleId: 99,
        tarsMenuKeys: ['chat-application'],
      }),
    );
  });

  it('rejects when an existing user belongs to a different provider', async () => {
    authenticateTars.mockResolvedValue(adminTarsUser);
    findUser.mockResolvedValue({ _id: 'x', provider: 'local', tarsId: 'tars-uuid-1' });

    const { user, info } = await callVerify('jdoe', 'secret');

    expect(user).toBe(false);
    expect(info.message).toBe(ErrorTypes.AUTH_FAILED);
  });

  it('blocks login when the email domain is not allowed', async () => {
    authenticateTars.mockResolvedValue(adminTarsUser);
    isEmailDomainAllowed.mockReturnValue(false);

    const { user, info } = await callVerify('jdoe', 'secret');

    expect(user).toBe(false);
    expect(info.message).toBe('Email domain not allowed');
    expect(createUser).not.toHaveBeenCalled();
  });

  it('blocks a non-active tars user', async () => {
    authenticateTars.mockResolvedValue({ ...adminTarsUser, status: 'inactive' });

    const { user, info } = await callVerify('jdoe', 'secret');

    expect(user).toBe(false);
    expect(info.message).toBe(ErrorTypes.AUTH_FAILED);
    expect(createUser).not.toHaveBeenCalled();
  });
});
