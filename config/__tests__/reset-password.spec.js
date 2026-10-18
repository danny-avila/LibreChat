const mockUser = { findOne: jest.fn() };
const mockPasskey = { deleteMany: jest.fn() };
const mockSession = { deleteMany: jest.fn() };
const mockMethods = {
  updateUser: jest.fn(),
  deleteAllAccountSessions: jest.fn(),
  awaitAuthUserDocEviction: jest.fn(),
};
const mockApplyOrganizationsMode = jest.fn();
const mockInLoginContext = jest.fn((operation) => operation());

jest.mock('../connect', () => jest.fn(async () => undefined));
jest.mock('readline', () => ({
  createInterface: () => ({
    question: (_query, answer) => answer('alice@example.com'),
    close: jest.fn(),
  }),
}));
jest.mock('bcryptjs', () => ({
  genSalt: jest.fn(async () => 'salt'),
  hash: jest.fn(async () => 'hashed-password'),
}));
jest.mock('@librechat/data-schemas', () => ({
  createModels: () => ({ User: mockUser, Passkey: mockPasskey, Session: mockSession }),
  createMethods: () => mockMethods,
}));
jest.mock('@librechat/api', () => ({
  createPasswordResetUpdate: (password) => ({ password }),
}));
jest.mock('~/cache/getLogStores', () => jest.fn());
jest.mock('../organizations', () => ({
  applyOrganizationsMode: (...args) => mockApplyOrganizationsMode(...args),
  inLoginContext: (operation) => mockInLoginContext(operation),
}));
jest.mock('../helpers', () => ({
  ...jest.requireActual('../helpers'),
  askSilentQuestion: jest.fn(async () => 'correct-horse-battery'),
}));

const runCli = () =>
  new Promise((resolve, reject) => {
    jest.spyOn(process, 'exit').mockImplementation((code) => resolve(code));
    jest.isolateModules(() => {
      try {
        require('../reset-password');
      } catch (error) {
        reject(error);
      }
    });
  });

describe('Reset password CLI', () => {
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockUser.findOne.mockReset().mockResolvedValue({ _id: { toString: () => 'account-1' } });
    mockPasskey.deleteMany.mockReset().mockResolvedValue({ deletedCount: 1 });
    mockSession.deleteMany.mockReset().mockResolvedValue({ deletedCount: 1 });
    mockMethods.updateUser.mockReset().mockResolvedValue({ _id: 'account-1' });
    mockMethods.deleteAllAccountSessions.mockReset().mockResolvedValue({ deletedCount: 2 });
    mockMethods.awaitAuthUserDocEviction.mockReset().mockResolvedValue(undefined);
    mockApplyOrganizationsMode.mockReset();
    mockInLoginContext.mockClear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('resets the login account and revokes its sessions in every organization', async () => {
    mockApplyOrganizationsMode.mockResolvedValue(true);

    expect(await runCli()).toBe(0);

    /* The lookup, the password write and the passkey purge all act on the login account. */
    expect(mockInLoginContext).toHaveBeenCalledTimes(3);
    expect(mockMethods.updateUser).toHaveBeenCalledWith(
      'account-1',
      { password: 'hashed-password' },
      {},
      { preserveExpiresAt: true },
    );
    expect(mockMethods.deleteAllAccountSessions).toHaveBeenCalledWith('account-1');
    expect(mockSession.deleteMany).not.toHaveBeenCalled();
    expect(mockMethods.awaitAuthUserDocEviction).toHaveBeenCalledWith('account-1');
  });

  it('revokes only the user sessions when organizations are off', async () => {
    mockApplyOrganizationsMode.mockResolvedValue(false);

    expect(await runCli()).toBe(0);

    expect(mockSession.deleteMany).toHaveBeenCalledWith({ user: expect.anything() });
    expect(mockMethods.deleteAllAccountSessions).not.toHaveBeenCalled();
  });
});
