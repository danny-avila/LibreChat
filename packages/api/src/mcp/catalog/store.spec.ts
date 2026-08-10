import { createMCPCatalogStore } from './store';

describe('createMCPCatalogStore Redis Cluster routing', () => {
  const cache = {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(true),
    delete: jest.fn().mockResolvedValue(true),
  };
  const ioredisClient = {
    set: jest.fn().mockResolvedValue('OK'),
    eval: jest.fn().mockResolvedValue(1),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('retries a Lua script on the Redis Cluster node named by a MOVED response', async () => {
    const targetEval = jest.fn().mockResolvedValue('1');
    const targetClient = { eval: targetEval };
    const targetNode = { client: targetClient };
    const keyvRedisClient = {
      eval: jest.fn().mockRejectedValueOnce(new Error('MOVED 4083 127.0.0.1:7001')),
      nodeByAddress: new Map([['127.0.0.1:7001', targetNode]]),
      nodeClient: jest.fn().mockResolvedValue(targetClient),
    };
    const store = createMCPCatalogStore({
      cacheConfig: {},
      getCache: () => cache,
      ioredisClient,
      keyvRedisClient,
    });

    await expect(store.getNextAppToolsPublicationRevision('server', 'config')).resolves.toBe('1');
    expect(keyvRedisClient.nodeClient).toHaveBeenCalledWith(targetNode);
    expect(targetEval).toHaveBeenCalledTimes(1);
  });

  it('sends ASKING before retrying a Lua script on an ASK redirect node', async () => {
    const targetEval = jest.fn().mockResolvedValue('1');
    const sendCommand = jest.fn().mockResolvedValue('OK');
    const targetClient = { eval: targetEval, sendCommand };
    const targetNode = { client: targetClient };
    const keyvRedisClient = {
      eval: jest.fn().mockRejectedValueOnce(new Error('ASK 4083 127.0.0.1:7001')),
      nodeByAddress: new Map([['127.0.0.1:7001', targetNode]]),
      nodeClient: jest.fn().mockResolvedValue(targetClient),
    };
    const store = createMCPCatalogStore({
      cacheConfig: {},
      getCache: () => cache,
      ioredisClient,
      keyvRedisClient,
    });

    await expect(store.getNextAppToolsPublicationRevision('server', 'config')).resolves.toBe('1');
    expect(sendCommand).toHaveBeenCalledWith(['ASKING']);
    expect(sendCommand.mock.invocationCallOrder[0]).toBeLessThan(
      targetEval.mock.invocationCallOrder[0],
    );
  });

  it('preserves a Redis script error when it is not a routable MOVED response', async () => {
    const failure = new Error('READONLY replica');
    const keyvRedisClient = {
      eval: jest.fn().mockRejectedValue(failure),
    };
    const store = createMCPCatalogStore({
      cacheConfig: {},
      getCache: () => cache,
      ioredisClient,
      keyvRedisClient,
    });

    await expect(store.getNextAppToolsPublicationRevision('server', 'config')).rejects.toBe(
      failure,
    );
  });
});
