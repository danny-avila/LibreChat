import { MCPServersRegistry } from '~/mcp/registry/MCPServersRegistry';
import { clearMcpConfigCache } from '~/mcp/cache';
import { MCPManager } from '~/mcp/MCPManager';

jest.mock('~/mcp/registry/MCPServersRegistry');
jest.mock('~/mcp/MCPManager');

describe('clearMcpConfigCache', () => {
  const setAllowlists = jest.fn();
  const invalidateConfigCache = jest.fn<Promise<string[]>, []>();

  beforeEach(() => {
    jest.clearAllMocks();
    invalidateConfigCache.mockResolvedValue([]);
    (MCPServersRegistry.getInstance as jest.Mock).mockReturnValue({
      setAllowlists,
      invalidateConfigCache,
    });
    (MCPManager.getInstance as jest.Mock).mockReturnValue({ appConnections: undefined });
  });

  it('refreshes the registry allowlists when allowlists are provided', async () => {
    await clearMcpConfigCache({
      allowedDomains: ['admin-added.com'],
      allowedAddresses: ['10.0.0.0/8'],
    });

    expect(setAllowlists).toHaveBeenCalledWith(['admin-added.com'], ['10.0.0.0/8']);
    expect(invalidateConfigCache).toHaveBeenCalledTimes(1);
  });

  it('applies the new allowlists before evicting the config cache', async () => {
    const order: string[] = [];
    setAllowlists.mockImplementation(() => {
      order.push('setAllowlists');
    });
    invalidateConfigCache.mockImplementation(async () => {
      order.push('invalidate');
      return [];
    });

    await clearMcpConfigCache({ allowedDomains: ['admin-added.com'] });

    expect(order).toEqual(['setAllowlists', 'invalidate']);
  });

  it('preserves current allowlists when no allowlists are provided', async () => {
    await clearMcpConfigCache();

    expect(setAllowlists).not.toHaveBeenCalled();
    expect(invalidateConfigCache).toHaveBeenCalledTimes(1);
  });

  it('returns gracefully without throwing when the registry is not initialized', async () => {
    (MCPServersRegistry.getInstance as jest.Mock).mockImplementation(() => {
      throw new Error('MCPServersRegistry has not been initialized.');
    });

    await expect(
      clearMcpConfigCache({ allowedDomains: ['admin-added.com'] }),
    ).resolves.toBeUndefined();
    expect(setAllowlists).not.toHaveBeenCalled();
    expect(invalidateConfigCache).not.toHaveBeenCalled();
  });
});
