const { registerUser } = require('./AuthService');
const { SystemRoles } = require('librechat-data-provider');
const { tierConfig } = require('./Config/tiers');

// Mock dependencies
jest.mock('~/models', () => ({
  findUser: jest.fn(),
  createUser: jest.fn(),
  countUsers: jest.fn(),
  updateUser: jest.fn(),
  deleteUserById: jest.fn(),
}));

jest.mock('~/server/services/Config', () => ({
  getAppConfig: jest.fn().mockResolvedValue({
    registration: { allowedDomains: [] },
    balance: { enabled: true },
  }),
}));

jest.mock('~/server/utils', () => ({
  sendEmail: jest.fn(),
}));

jest.mock('~/strategies/validators', () => ({
  registerSchema: {
    safeParse: jest.fn().mockReturnValue({ error: null }),
  },
}));

jest.mock('@librechat/api', () => ({
  isEnabled: jest.fn().mockReturnValue(false),
  checkEmailConfig: jest.fn().mockReturnValue(false),
  isEmailDomainAllowed: jest.fn().mockReturnValue(true),
}));

const { createUser, countUsers } = require('~/models');

describe('AuthService - registerUser', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should register a user with default USER role and correct tier config', async () => {
    const userData = {
      email: 'test@example.com',
      password: 'password123',
      name: 'Test User',
      username: 'testuser',
    };

    countUsers.mockResolvedValue(1); // Not the first user
    createUser.mockResolvedValue({ _id: 'newUserId', emailVerified: true });

    await registerUser(userData);

    expect(createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        role: SystemRoles.USER,
      }),
      tierConfig[SystemRoles.USER],
      false,
      true,
    );
  });

  it('should register a user with BASIC role and correct tier config', async () => {
    const userData = {
      email: 'basic@example.com',
      password: 'password123',
      name: 'Basic User',
      username: 'basicuser',
    };

    countUsers.mockResolvedValue(1);
    createUser.mockResolvedValue({ _id: 'newUserId', emailVerified: true });

    await registerUser(userData, { role: SystemRoles.BASIC });

    expect(createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        role: SystemRoles.BASIC,
      }),
      tierConfig[SystemRoles.BASIC],
      false,
      true,
    );
  });

  it('should register a user with PRO role and correct tier config', async () => {
    const userData = {
      email: 'pro@example.com',
      password: 'password123',
      name: 'Pro User',
      username: 'prouser',
    };

    countUsers.mockResolvedValue(1);
    createUser.mockResolvedValue({ _id: 'newUserId', emailVerified: true });

    await registerUser(userData, { role: SystemRoles.PRO });

    expect(createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        role: SystemRoles.PRO,
      }),
      tierConfig[SystemRoles.PRO],
      false,
      true,
    );
  });
});
