import type { IMongoFile } from '@librechat/data-schemas';
import type { ErasureResolverDeps } from './resolver';
import { createErasureResolver } from './resolver';

function createDeps(overrides: Partial<ErasureResolverDeps> = {}) {
  const disconnectUserConnection = jest.fn().mockResolvedValue(undefined);
  const deps = {
    db: { deleteConvos: jest.fn() },
    getAppConfig: jest
      .fn()
      .mockResolvedValue({ endpoints: { agents: { checkpointer: { ttl: 5 } } } }),
    processDeleteRequest: jest.fn().mockResolvedValue(undefined),
    invalidateCachedTools: jest.fn().mockResolvedValue(undefined),
    getMCPManager: jest.fn(() => ({ disconnectUserConnection })),
    openCheckpointDeletion: jest.fn(),
    deleteSharedLinks: jest.fn(),
    ...overrides,
  } as unknown as ErasureResolverDeps;
  return { deps, disconnectUserConnection };
}

const target = { id: 'user-1', role: 'USER', tenantId: 'tenant-1' };

describe('createErasureResolver', () => {
  it('resolves the target config and its checkpointer', async () => {
    const { deps } = createDeps();
    const result = await createErasureResolver(deps)(target);

    expect(deps.getAppConfig).toHaveBeenCalledWith({
      role: 'USER',
      userId: 'user-1',
      tenantId: 'tenant-1',
    });
    expect(result.checkpointer).toEqual({ ttl: 5 });
    expect(result.deps.openCheckpointDeletion).toBe(deps.openCheckpointDeletion);
    expect(result.deps.deleteSharedLinks).toBe(deps.deleteSharedLinks);
  });

  it('deletes stored files with a request that carries the target user', async () => {
    const { deps } = createDeps();
    const { deps: erasure } = await createErasureResolver(deps)(target);
    const files = [{ file_id: 'f1' }] as IMongoFile[];

    await erasure.deleteStoredFiles(files);

    expect(deps.processDeleteRequest).toHaveBeenCalledWith({
      req: expect.objectContaining({
        user: { id: 'user-1', _id: 'user-1', role: 'USER', tenantId: 'tenant-1' },
        body: {},
        query: {},
        baseUrl: '',
      }),
      files,
    });
  });

  it('scopes MCP runtime cleanup to the target user', async () => {
    const { deps, disconnectUserConnection } = createDeps();
    const { deps: erasure } = await createErasureResolver(deps)(target);

    await erasure.invalidateMCPServerTools?.('srv');
    await erasure.disconnectMCPServer?.('srv');

    expect(deps.invalidateCachedTools).toHaveBeenCalledWith({
      userId: 'user-1',
      serverName: 'srv',
    });
    expect(disconnectUserConnection).toHaveBeenCalledWith('user-1', 'srv');
  });

  it('tolerates a missing MCP manager', async () => {
    const { deps } = createDeps({ getMCPManager: jest.fn(() => undefined) });
    const { deps: erasure } = await createErasureResolver(deps)(target);

    await expect(erasure.disconnectMCPServer?.('srv')).resolves.toBeUndefined();
  });
});
