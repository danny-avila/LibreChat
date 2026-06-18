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
const { findUser, createUser, updateUser, countUsers } = require('~/models');

// Load once so the verify callback is captured against our persistent mocks
require('./tarsStrategy');

const callVerify = (username, password) =>
  new Promise((resolve, reject) => {
    verifyCallback(username, password, (err, user, info) => {
      if (err) return reject(err);
      resolve({ user, info });
    });
  });

const tarsUser = {
  id: 'tars-uuid-1',
  username: 'jdoe',
  email: 'jdoe@example.com',
  name: 'John Doe',
};

describe('tarsStrategy', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    findUser.mockReset().mockResolvedValue(null);
    createUser.mockReset().mockResolvedValue('newUserId');
    updateUser.mockReset().mockImplementation(async (id, user) => ({ _id: id, ...user }));
    countUsers.mockReset().mockResolvedValue(0);
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

  it('creates a local shadow user as ADMIN for the first user', async () => {
    authenticateTars.mockResolvedValue(tarsUser);
    countUsers.mockResolvedValue(0);

    const { user } = await callVerify('jdoe', 'secret');

    expect(createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'tars',
        tarsId: 'tars-uuid-1',
        username: 'jdoe',
        email: 'jdoe@example.com',
        role: 'ADMIN',
        emailVerified: true,
      }),
      expect.anything(),
    );
    expect(user._id).toBe('newUserId');
  });

  it('updates an existing tars user instead of creating', async () => {
    authenticateTars.mockResolvedValue(tarsUser);
    findUser.mockResolvedValue({ _id: 'existing-id', provider: 'tars', tarsId: 'tars-uuid-1' });

    await callVerify('jdoe', 'secret');

    expect(createUser).not.toHaveBeenCalled();
    expect(updateUser).toHaveBeenCalledWith(
      'existing-id',
      expect.objectContaining({
        provider: 'tars',
        tarsId: 'tars-uuid-1',
        email: 'jdoe@example.com',
      }),
    );
  });

  it('rejects when an existing user belongs to a different provider', async () => {
    authenticateTars.mockResolvedValue(tarsUser);
    findUser.mockResolvedValue({ _id: 'x', provider: 'local', tarsId: 'tars-uuid-1' });

    const { user, info } = await callVerify('jdoe', 'secret');

    expect(user).toBe(false);
    expect(info.message).toBe(ErrorTypes.AUTH_FAILED);
  });

  it('blocks login when the email domain is not allowed', async () => {
    authenticateTars.mockResolvedValue(tarsUser);
    isEmailDomainAllowed.mockReturnValue(false);

    const { user, info } = await callVerify('jdoe', 'secret');

    expect(user).toBe(false);
    expect(info.message).toBe('Email domain not allowed');
    expect(createUser).not.toHaveBeenCalled();
  });
});
