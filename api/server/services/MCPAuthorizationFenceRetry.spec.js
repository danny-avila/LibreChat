const mockUpdateOne = jest.fn();
const mockDeleteOne = jest.fn();
const mockToArray = jest.fn();
const mockLimit = jest.fn(() => ({ toArray: mockToArray }));
const mockSort = jest.fn(() => ({ limit: mockLimit }));
const mockFind = jest.fn(() => ({ sort: mockSort }));
const mockCollection = {
  updateOne: mockUpdateOne,
  deleteOne: mockDeleteOne,
  find: mockFind,
};
const mockGetTenantId = jest.fn();
const mockTenantRun = jest.fn((_context, fn) => fn());
const mockRunAsSystem = jest.fn((fn) => fn());
const mockRetryService = {
  clear: jest.fn(),
  drain: jest.fn(),
  persist: jest.fn(),
  start: jest.fn(),
};
let capturedDeps;

jest.mock('mongoose', () => ({
  connection: { collection: jest.fn(() => mockCollection) },
}));
jest.mock('@librechat/data-schemas', () => ({
  getTenantId: (...args) => mockGetTenantId(...args),
  runAsSystem: (...args) => mockRunAsSystem(...args),
  tenantStorage: { run: (...args) => mockTenantRun(...args) },
}));
jest.mock('@librechat/api', () => ({
  createMCPAuthorizationFenceRetryService: (deps) => {
    capturedDeps = deps;
    return mockRetryService;
  },
}));

const retryAdapter = require('./MCPAuthorizationFenceRetry');

describe('MCPAuthorizationFenceRetry adapter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdateOne.mockResolvedValue({ acknowledged: true });
    mockDeleteOne.mockResolvedValue({ deletedCount: 1 });
    mockToArray.mockResolvedValue([]);
  });

  it('exports the package-owned retry lifecycle', () => {
    expect(retryAdapter).toEqual({
      clearMCPAuthorizationFenceRetry: mockRetryService.clear,
      drainMCPAuthorizationFenceRetries: mockRetryService.drain,
      persistMCPAuthorizationFenceRetry: mockRetryService.persist,
      startMCPAuthorizationFenceRetryWorker: mockRetryService.start,
    });
  });

  it('maps versioned retry storage to MongoDB', async () => {
    const now = new Date();
    const scope = { userId: 'user-1', serverName: 'github' };

    await capturedDeps.storage.upsert({ scope, tenantId: 'tenant-a', version: 'v2', now });
    await capturedDeps.storage.deleteVersion({
      scope,
      tenantId: 'tenant-a',
      version: 'v1',
    });

    expect(mockUpdateOne).toHaveBeenCalledWith(
      { _id: JSON.stringify(['tenant-a', 'user-1', 'github']) },
      {
        $set: {
          userId: 'user-1',
          serverName: 'github',
          tenantId: 'tenant-a',
          version: 'v2',
          updatedAt: now,
        },
        $setOnInsert: { createdAt: now },
      },
      { upsert: true },
    );
    expect(mockDeleteOne).toHaveBeenCalledWith({
      _id: JSON.stringify(['tenant-a', 'user-1', 'github']),
      version: 'v1',
    });
  });

  it('reads retry batches globally and restores tenant context for replay', async () => {
    const retry = {
      tenantId: 'tenant-a',
      userId: 'user-1',
      serverName: 'github',
      version: 'v1',
    };
    mockToArray.mockResolvedValue([retry]);

    await expect(capturedDeps.storage.list(7)).resolves.toEqual([retry]);
    const operation = jest.fn().mockResolvedValue(undefined);
    await capturedDeps.runInRetryScope(retry, operation);

    expect(mockRunAsSystem).toHaveBeenCalledWith(expect.any(Function));
    expect(mockLimit).toHaveBeenCalledWith(7);
    expect(mockTenantRun).toHaveBeenCalledWith(
      { tenantId: 'tenant-a', userId: 'user-1' },
      operation,
    );
  });
});
