const mockFindOne = jest.fn();
const mockFindPlatformOperator = jest.fn();
const mockTransferPlatformOperator = jest.fn();
const mockApplyOrganizationsMode = jest.fn();
const mockAskQuestion = jest.fn();
const mockSilentExit = jest.fn();

jest.mock('../connect', () => jest.fn(async () => undefined));
jest.mock('@librechat/data-schemas', () => ({
  createModels: () => ({ User: { findOne: (...args) => mockFindOne(...args) } }),
}));
jest.mock('~/models', () => ({
  findPlatformOperator: (...args) => mockFindPlatformOperator(...args),
  transferPlatformOperator: (...args) => mockTransferPlatformOperator(...args),
}));
jest.mock('../organizations', () => ({
  applyOrganizationsMode: (...args) => mockApplyOrganizationsMode(...args),
  inLoginContext: (operation) => operation(),
}));
jest.mock('../helpers', () => ({
  ...jest.requireActual('../helpers'),
  askQuestion: (...args) => mockAskQuestion(...args),
  silentExit: (...args) => mockSilentExit(...args),
}));

const bob = { _id: { toString: () => 'account-bob' }, email: 'bob@example.com' };
const alice = { _id: { toString: () => 'account-alice' }, email: 'alice@example.com' };

const runCli = (...args) =>
  new Promise((resolve, reject) => {
    process.argv = ['node', 'set-operator.js', ...args];
    mockSilentExit.mockImplementation((code = 0) => resolve(code));
    jest.isolateModules(() => {
      try {
        require('../set-operator');
      } catch (error) {
        reject(error);
      }
    });
  });

describe('Set operator CLI', () => {
  const originalArgv = process.argv;
  const existingHandlers = new Set(process.listeners('uncaughtException'));

  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    mockApplyOrganizationsMode.mockReset().mockResolvedValue(true);
    mockFindPlatformOperator.mockReset().mockResolvedValue(alice);
    mockTransferPlatformOperator.mockReset().mockResolvedValue(true);
    mockAskQuestion.mockReset().mockResolvedValue('y');
    mockSilentExit.mockReset();
    mockFindOne.mockReset().mockReturnValue({ lean: async () => bob });
  });

  afterEach(() => {
    process.argv = originalArgv;
    process
      .listeners('uncaughtException')
      .filter((handler) => !existingHandlers.has(handler))
      .forEach((handler) => process.removeListener('uncaughtException', handler));
    jest.restoreAllMocks();
  });

  it('hands the operator role to another account after confirmation', async () => {
    expect(await runCli('Bob@Example.com')).toBe(0);

    expect(mockFindOne).toHaveBeenCalledWith({ email: 'bob@example.com' });
    expect(mockTransferPlatformOperator).toHaveBeenCalledWith(bob._id);
  });

  it('changes nothing when the confirmation is declined', async () => {
    mockAskQuestion.mockResolvedValue('n');

    expect(await runCli('bob@example.com')).toBe(0);

    expect(mockTransferPlatformOperator).not.toHaveBeenCalled();
  });

  it('refuses an unknown account', async () => {
    mockFindOne.mockReturnValue({ lean: async () => null });

    expect(await runCli('nobody@example.com')).toBe(1);

    expect(mockTransferPlatformOperator).not.toHaveBeenCalled();
  });

  it('refuses to run when organizations are off', async () => {
    mockApplyOrganizationsMode.mockResolvedValue(false);

    expect(await runCli('bob@example.com')).toBe(1);

    expect(mockFindOne).not.toHaveBeenCalled();
  });
});
