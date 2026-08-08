const { Permissions, PermissionTypes } = require('librechat-data-provider');

const mockFindUser = jest.fn();
const mockFindRolesByNames = jest.fn();
const mockGetRoleByName = jest.fn();
const mockReadStableSnapshot = jest.fn(async (read) => ({
  generation: 1,
  snapshot: await read(),
}));

jest.mock('~/models', () => ({
  findUser: mockFindUser,
  findRolesByNames: mockFindRolesByNames,
  getRoleByName: mockGetRoleByName,
  readStableSnapshot: mockReadStableSnapshot,
}));

const { createOboTrustChecker } = require('./OboPolicyService');

describe('createOboTrustChecker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('reads the author role directly instead of trusting the shared role cache', async () => {
    mockFindUser.mockResolvedValue({ role: 'MCP-AUTHOR' });
    mockFindRolesByNames.mockResolvedValue([
      {
        name: 'MCP-AUTHOR',
        permissions: {
          [PermissionTypes.MCP_SERVERS]: { [Permissions.CONFIGURE_OBO]: false },
        },
      },
    ]);
    mockGetRoleByName.mockResolvedValue({
      permissions: {
        [PermissionTypes.MCP_SERVERS]: { [Permissions.CONFIGURE_OBO]: true },
      },
    });

    await expect(
      createOboTrustChecker()({ source: 'user', author: 'author-1', dbId: 'server-1' }),
    ).resolves.toBe(false);

    expect(mockFindRolesByNames).toHaveBeenCalledWith(['MCP-AUTHOR'], 'name permissions');
    expect(mockGetRoleByName).not.toHaveBeenCalled();
    expect(mockReadStableSnapshot).toHaveBeenCalledTimes(1);
  });
});
