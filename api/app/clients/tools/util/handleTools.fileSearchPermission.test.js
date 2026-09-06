/**
 * The `FILE_SEARCH` role permission must gate the `file_search` tool the same way
 * `RUN_CODE` gates `execute_code` in `~/server/controllers/tools.js`.
 *
 * Before this gate existed, a user whose role had `FILE_SEARCH.USE = false` still
 * got the tool equipped — and could upload and embed documents through the API.
 * The permission was stored and served, but never checked.
 */

const mockCheckAccess = jest.fn();
const mockGetRoleByName = jest.fn();
const mockPrimeSearchFiles = jest.fn(async () => ({ files: [], toolContext: undefined }));
const mockCreateFileSearchTool = jest.fn(async () => ({ name: 'file_search' }));

jest.mock('@librechat/data-schemas', () => ({
  ...jest.requireActual('@librechat/data-schemas'),
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('@librechat/api', () => ({
  ...jest.requireActual('@librechat/api'),
  checkAccess: (...args) => mockCheckAccess(...args),
}));

jest.mock('~/models', () => ({
  ...jest.requireActual('~/models'),
  getRoleByName: (...args) => mockGetRoleByName(...args),
}));

jest.mock('./fileSearch', () => ({
  primeFiles: (...args) => mockPrimeSearchFiles(...args),
  createFileSearchTool: (...args) => mockCreateFileSearchTool(...args),
}));

const { Tools, Permissions, PermissionTypes } = require('librechat-data-provider');
const { logger } = require('@librechat/data-schemas');
const { loadTools } = require('./handleTools');

/** `loadTools` takes the request under a nested `options` key — passing `req` at
 * the top level silently skips every `options.req`-guarded branch. */
const buildOptions = () => ({
  user: 'user-1',
  tools: [Tools.file_search],
  options: {
    req: { user: { id: 'user-1', role: 'USER' }, config: {}, app: { locals: {} } },
  },
});

describe('loadTools — FILE_SEARCH permission gate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('equips file_search when the role permits it', async () => {
    mockCheckAccess.mockResolvedValue(true);

    const { loadedTools } = await loadTools(buildOptions());

    expect(mockCheckAccess).toHaveBeenCalledWith(
      expect.objectContaining({
        permissionType: PermissionTypes.FILE_SEARCH,
        permissions: [Permissions.USE],
      }),
    );
    expect(loadedTools.map((tool) => tool.name)).toContain(Tools.file_search);
  });

  it('does not equip file_search when the role denies it', async () => {
    mockCheckAccess.mockResolvedValue(false);

    const { loadedTools } = await loadTools(buildOptions());

    expect(loadedTools.map((tool) => tool.name)).not.toContain(Tools.file_search);
    /** The tool must not even be constructed — a denied user should never get a
     * tool that merely fails later. */
    expect(mockCreateFileSearchTool).not.toHaveBeenCalled();
  });

  it('logs the denial with the permission type, matching the RUN_CODE gate', async () => {
    mockCheckAccess.mockResolvedValue(false);

    await loadTools(buildOptions());

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining(PermissionTypes.FILE_SEARCH),
    );
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('user-1'));
  });

  it('denies when the permission check itself throws', async () => {
    mockCheckAccess.mockRejectedValue(new Error('role lookup failed'));

    const { loadedTools } = await loadTools(buildOptions());

    /** Fail closed: an unreachable role store must not hand out the tool. */
    expect(loadedTools.map((tool) => tool.name)).not.toContain(Tools.file_search);
    expect(logger.error).toHaveBeenCalled();
  });
});
