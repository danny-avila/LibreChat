jest.mock('@librechat/data-schemas', () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn(),
  },
}));

jest.mock('@librechat/api', () => ({
  isEnabled: jest.fn(() => false),
  checkEmailConfig: jest.fn(() => false),
}));

jest.mock('~/models', () => ({
  findUser: jest.fn(),
  comparePassword: jest.fn(),
  updateUser: jest.fn(),
}));

let verifyCallback;
jest.mock('passport-local', () => ({
  Strategy: jest.fn().mockImplementation((options, verify) => {
    verifyCallback = verify;
    return { name: 'local', options, verify };
  }),
}));

const { findUser, comparePassword } = require('~/models');

describe('localStrategy', () => {
  const req = {
    body: {
      email: 'chris@noblezilla.com',
      password: 'password123',
    },
    ip: '127.0.0.1',
  };

  const callVerify = () =>
    new Promise((resolve, reject) => {
      verifyCallback(req, req.body.email, req.body.password, (err, user, info) => {
        if (err) {
          reject(err);
          return;
        }
        resolve({ user, info });
      });
    });

  beforeEach(() => {
    jest.clearAllMocks();
    require('./localStrategy')();
  });

  it('rejects password login for non-local providers', async () => {
    findUser.mockResolvedValue({
      _id: 'user-1',
      email: 'chris@noblezilla.com',
      provider: 'google',
      password: '$2b$10$hash',
    });

    const result = await callVerify();

    expect(result.user).toBe(false);
    expect(result.info).toEqual({ message: 'This account uses google sign-in.' });
    expect(comparePassword).not.toHaveBeenCalled();
  });
});
