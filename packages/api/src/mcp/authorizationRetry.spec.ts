import type {
  MCPAuthorizationFenceRetryRecord,
  MCPAuthorizationFenceRetryStorage,
} from './authorizationRetry';
import { createMCPAuthorizationFenceRetryService } from './authorizationRetry';

const scope = { userId: 'user-1', serverName: 'server-1' };

function createHarness() {
  const records = new Map<string, MCPAuthorizationFenceRetryRecord>();
  const key = (tenantId: string | null | undefined, userId: string, serverName: string) =>
    JSON.stringify([tenantId ?? '', userId, serverName]);
  const storage: MCPAuthorizationFenceRetryStorage = {
    upsert: jest.fn(async ({ scope: inputScope, tenantId, version, now }) => {
      records.set(key(tenantId, inputScope.userId, inputScope.serverName), {
        ...inputScope,
        tenantId,
        version,
        updatedAt: now,
      });
    }),
    deleteVersion: jest.fn(async ({ scope: inputScope, tenantId, version }) => {
      const recordKey = key(tenantId, inputScope.userId, inputScope.serverName);
      if (records.get(recordKey)?.version === version) {
        records.delete(recordKey);
      }
    }),
    list: jest.fn(async (limit) => [...records.values()].slice(0, limit)),
  };
  const runInRetryScope = jest.fn(async (_retry, operation) => operation());
  const registerShutdown = jest.fn();
  const service = createMCPAuthorizationFenceRetryService({
    storage,
    getTenantId: () => 'tenant-a',
    runInRetryScope,
    registerShutdown,
  });
  return { records, registerShutdown, runInRetryScope, service, storage };
}

describe('MCP authorization fence retry service', () => {
  afterEach(() => jest.useRealTimers());

  it('clears only the marker version created by that publisher', async () => {
    const { records, service, storage } = createHarness();
    const firstVersion = await service.persist(scope);
    const secondVersion = await service.persist(scope);

    await service.clear(scope, firstVersion);

    expect(storage.deleteVersion).toHaveBeenCalledWith({
      scope,
      tenantId: 'tenant-a',
      version: firstVersion,
    });
    expect([...records.values()]).toEqual([
      expect.objectContaining({ ...scope, version: secondVersion }),
    ]);
  });

  it('replays a bounded batch in tenant scope and deletes exact published versions', async () => {
    const { records, runInRetryScope, service, storage } = createHarness();
    const version = await service.persist(scope);
    const invalidate = jest.fn().mockResolvedValue(undefined);

    service.start(invalidate, { intervalMs: 5_000, batchSize: 7 });
    await service.drain();

    expect(storage.list).toHaveBeenCalledWith(7);
    expect(runInRetryScope).toHaveBeenCalledWith(
      expect.objectContaining({ ...scope, tenantId: 'tenant-a', version }),
      expect.any(Function),
    );
    expect(invalidate).toHaveBeenCalledWith(scope);
    expect(storage.deleteVersion).toHaveBeenCalledWith({
      scope,
      tenantId: 'tenant-a',
      version,
    });
    expect(records.size).toBe(0);
    await service.stop();
  });

  it('uses the configured cadence and registers clean shutdown', async () => {
    jest.useFakeTimers();
    const { registerShutdown, service, storage } = createHarness();
    service.start(jest.fn().mockResolvedValue(undefined), { intervalMs: 2_500, batchSize: 3 });
    await service.drain();
    (storage.list as jest.Mock).mockClear();

    await jest.advanceTimersByTimeAsync(2_500);

    expect(storage.list).toHaveBeenCalledWith(3);
    expect(registerShutdown).toHaveBeenCalledWith(
      'MCP authorization fence retry worker',
      expect.any(Function),
    );
    await service.stop();
  });
});
