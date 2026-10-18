const mockFindOne = jest.fn();
const mockRegisterUser = jest.fn();
const mockMaterializePendingAccess = jest.fn();
const mockApplyOrganizationsMode = jest.fn();
const mockInLoginContext = jest.fn((operation) => operation());
const mockAskQuestion = jest.fn();
const mockSilentExit = jest.fn();
const mockFindPlatformOperator = jest.fn();
const mockClaimPlatformOperator = jest.fn();

jest.mock('../connect', () => jest.fn(async () => undefined));
jest.mock('@librechat/data-schemas', () => ({
  createModels: () => ({ User: { findOne: (...args) => mockFindOne(...args) } }),
}));
jest.mock('~/server/services/AuthService', () => ({
  registerUser: (...args) => mockRegisterUser(...args),
}));
jest.mock('~/server/services/Organizations', () => ({
  organizations: { materializePendingAccess: (...args) => mockMaterializePendingAccess(...args) },
}));
jest.mock('~/models', () => ({
  findPlatformOperator: (...args) => mockFindPlatformOperator(...args),
  claimPlatformOperator: (...args) => mockClaimPlatformOperator(...args),
}));
jest.mock('../organizations', () => ({
  applyOrganizationsMode: (...args) => mockApplyOrganizationsMode(...args),
  inLoginContext: (operation) => mockInLoginContext(operation),
}));
jest.mock('../helpers', () => ({
  ...jest.requireActual('../helpers'),
  askQuestion: (...args) => mockAskQuestion(...args),
  silentExit: (...args) => mockSilentExit(...args),
}));

const account = { _id: 'account-1', email: 'alice@example.com', emailVerified: true };

const runCli = (...flags) =>
  new Promise((resolve, reject) => {
    process.argv = [
      'node',
      'create-user.js',
      'alice@example.com',
      'Alice',
      'alice',
      'correct-horse-battery',
      ...flags,
    ];
    mockSilentExit.mockImplementation((code = 0) => resolve(code));
    jest.isolateModules(() => {
      try {
        require('../create-user');
      } catch (error) {
        reject(error);
      }
    });
  });

describe('Create user CLI', () => {
  const originalArgv = process.argv;
  const existingHandlers = new Set(process.listeners('uncaughtException'));

  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockApplyOrganizationsMode.mockReset().mockResolvedValue(true);
    mockRegisterUser.mockReset().mockResolvedValue({ status: 200, message: 'ok' });
    mockMaterializePendingAccess.mockReset().mockResolvedValue(undefined);
    mockInLoginContext.mockClear();
    mockAskQuestion.mockReset();
    mockSilentExit.mockReset();
    mockFindPlatformOperator.mockReset().mockResolvedValue(null);
    mockClaimPlatformOperator.mockReset().mockResolvedValue(true);
    mockFindOne
      .mockReset()
      .mockImplementationOnce(() => Promise.resolve(null))
      .mockImplementation(() => ({ lean: async () => account }));
  });

  afterEach(() => {
    process.argv = originalArgv;
    process
      .listeners('uncaughtException')
      .filter((handler) => !existingHandlers.has(handler))
      .forEach((handler) => process.removeListener('uncaughtException', handler));
    jest.restoreAllMocks();
  });

  it('creates a login account that runs the named organization', async () => {
    expect(await runCli('--email-verified=true', '--organization=Acme')).toBe(0);

    expect(mockRegisterUser).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'alice@example.com', organization: { name: 'Acme' } }),
      { emailVerified: true },
    );
    /* Both lookups resolve the login account, never a member record. */
    expect(mockInLoginContext).toHaveBeenCalledTimes(2);
    expect(mockMaterializePendingAccess).toHaveBeenCalledWith(account);
  });

  it('asks for the organization when the flag is missing', async () => {
    mockAskQuestion.mockResolvedValueOnce('Acme');

    expect(await runCli('--email-verified=true')).toBe(0);

    expect(mockAskQuestion).toHaveBeenCalledWith('Organization name:');
    expect(mockRegisterUser.mock.calls[0][0].organization).toEqual({ name: 'Acme' });
  });

  it('leaves the organization pending until an unverified account verifies', async () => {
    mockFindOne
      .mockReset()
      .mockImplementationOnce(() => Promise.resolve(null))
      .mockImplementation(() => ({ lean: async () => ({ ...account, emailVerified: false }) }));

    expect(await runCli('--email-verified=false', '--organization=Acme')).toBe(0);

    expect(mockMaterializePendingAccess).not.toHaveBeenCalled();
  });

  it('reports an invalid organization name without creating anything', async () => {
    mockRegisterUser.mockResolvedValueOnce({
      status: 400,
      message: 'ORG_NAME_INVALID',
      code: 'ORG_NAME_INVALID',
    });
    mockFindOne
      .mockReset()
      .mockImplementationOnce(() => Promise.resolve(null))
      .mockImplementation(() => ({ lean: async () => null }));

    expect(await runCli('--email-verified=true', '--organization=A')).toBe(1);

    expect(mockMaterializePendingAccess).not.toHaveBeenCalled();
  });

  it('refuses an organization when organizations are off', async () => {
    mockApplyOrganizationsMode.mockResolvedValue(false);

    expect(await runCli('--email-verified=true', '--organization=Acme')).toBe(1);

    expect(mockRegisterUser).not.toHaveBeenCalled();
  });

  it('creates a plain user exactly as before when organizations are off', async () => {
    mockApplyOrganizationsMode.mockResolvedValue(false);

    expect(await runCli('--email-verified=true')).toBe(0);

    expect(mockRegisterUser.mock.calls[0][0]).not.toHaveProperty('organization');
    expect(mockAskQuestion).not.toHaveBeenCalled();
    expect(mockMaterializePendingAccess).not.toHaveBeenCalled();
  });

  it('makes the new account the platform operator with --operator', async () => {
    expect(await runCli('--email-verified=true', '--organization=Acme', '--operator')).toBe(0);

    expect(mockClaimPlatformOperator).toHaveBeenCalledWith('account-1');
  });

  it('refuses --operator when an operator already exists', async () => {
    mockFindPlatformOperator.mockResolvedValue({ email: 'owner@example.com' });

    expect(await runCli('--email-verified=true', '--organization=Acme', '--operator')).toBe(1);

    expect(mockRegisterUser).not.toHaveBeenCalled();
  });

  it('claims nothing extra without the flag', async () => {
    expect(await runCli('--email-verified=true', '--organization=Acme')).toBe(0);

    expect(mockClaimPlatformOperator).not.toHaveBeenCalled();
  });
});
