const mockFindOne = jest.fn();
const mockBanViolation = jest.fn();
const mockApplyOrganizationsMode = jest.fn();
const mockInLoginContext = jest.fn((operation) => operation());
const mockSilentExit = jest.fn();

jest.mock('../connect', () => jest.fn(async () => undefined));
jest.mock('@librechat/data-schemas', () => ({
  createModels: () => ({ User: { findOne: (...args) => mockFindOne(...args) } }),
}));
jest.mock(
  '~/cache/banViolation',
  () =>
    (...args) =>
      mockBanViolation(...args),
);
jest.mock('../organizations', () => ({
  applyOrganizationsMode: (...args) => mockApplyOrganizationsMode(...args),
  inLoginContext: (operation) => mockInLoginContext(operation),
}));
jest.mock('../helpers', () => ({
  ...jest.requireActual('../helpers'),
  silentExit: (...args) => mockSilentExit(...args),
}));

const runCli = () =>
  new Promise((resolve, reject) => {
    process.argv = ['node', 'ban-user.js', 'alice@example.com', '60000'];
    mockSilentExit.mockImplementation((code = 0) => resolve(code));
    jest.isolateModules(() => {
      try {
        require('../ban-user');
      } catch (error) {
        reject(error);
      }
    });
  });

describe('Ban user CLI', () => {
  const originalArgv = process.argv;
  const existingHandlers = new Set(process.listeners('uncaughtException'));

  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    mockApplyOrganizationsMode.mockReset().mockResolvedValue(true);
    mockBanViolation.mockReset().mockResolvedValue(undefined);
    mockInLoginContext.mockClear();
    mockFindOne.mockReset().mockReturnValue({
      lean: async () => ({ _id: 'account-1', email: 'alice@example.com' }),
    });
  });

  afterEach(() => {
    process.argv = originalArgv;
    process
      .listeners('uncaughtException')
      .filter((handler) => !existingHandlers.has(handler))
      .forEach((handler) => process.removeListener('uncaughtException', handler));
    jest.restoreAllMocks();
  });

  /** Members are checked against their account, so the ban holds in every organization. */
  it('bans the login account the email signs in with', async () => {
    expect(await runCli()).toBe(0);

    expect(mockApplyOrganizationsMode).toHaveBeenCalled();
    expect(mockInLoginContext).toHaveBeenCalledTimes(1);
    expect(mockFindOne).toHaveBeenCalledWith({ email: 'alice@example.com' });
    expect(mockBanViolation).toHaveBeenCalledWith(
      {},
      expect.any(Object),
      expect.objectContaining({ user_id: 'account-1', duration: 60000 }),
    );
  });
});
