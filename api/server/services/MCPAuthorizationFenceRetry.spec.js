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
const mockRegisterShutdownTask = jest.fn();

jest.mock('mongoose', () => ({
  connection: { collection: jest.fn(() => mockCollection) },
}));
jest.mock('@librechat/data-schemas', () => ({
  logger: { warn: jest.fn() },
  getTenantId: (...args) => mockGetTenantId(...args),
  runAsSystem: (fn) => fn(),
  tenantStorage: { run: (...args) => mockTenantRun(...args) },
}));
jest.mock('@librechat/api', () => ({
  registerShutdownTask: (...args) => mockRegisterShutdownTask(...args),
}));

const {
  drainMCPAuthorizationFenceRetries,
  persistMCPAuthorizationFenceRetry,
  startMCPAuthorizationFenceRetryWorker,
} = require('./MCPAuthorizationFenceRetry');

describe('MCPAuthorizationFenceRetry', () => {
  beforeAll(() => jest.useFakeTimers());
  afterAll(() => jest.useRealTimers());

  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdateOne.mockResolvedValue({ acknowledged: true });
    mockDeleteOne.mockResolvedValue({ deletedCount: 1 });
    mockToArray.mockResolvedValue([]);
    mockGetTenantId.mockReturnValue('tenant-a');
  });

  it('persists latest-wins retry intent in MongoDB', async () => {
    await persistMCPAuthorizationFenceRetry({ userId: 'user-1', serverName: 'github' });

    expect(mockUpdateOne).toHaveBeenCalledWith(
      { _id: JSON.stringify(['tenant-a', 'user-1', 'github']) },
      expect.objectContaining({
        $set: expect.objectContaining({
          userId: 'user-1',
          serverName: 'github',
          tenantId: 'tenant-a',
          version: expect.any(String),
        }),
      }),
      { upsert: true },
    );
  });

  it('replays persisted fences in their tenant and deletes only the published version', async () => {
    const retry = {
      _id: 'retry-1',
      version: 'version-1',
      tenantId: 'tenant-a',
      userId: 'user-1',
      serverName: 'github',
    };
    mockToArray.mockResolvedValue([retry]);
    const invalidate = jest.fn().mockResolvedValue(undefined);

    startMCPAuthorizationFenceRetryWorker(invalidate);
    await drainMCPAuthorizationFenceRetries();

    expect(mockTenantRun).toHaveBeenCalledWith(
      { tenantId: 'tenant-a', userId: 'user-1' },
      expect.any(Function),
    );
    expect(invalidate).toHaveBeenCalledWith({ userId: 'user-1', serverName: 'github' });
    expect(mockDeleteOne).toHaveBeenCalledWith({ _id: 'retry-1', version: 'version-1' });
    expect(mockRegisterShutdownTask).toHaveBeenCalledWith(
      'MCP authorization fence retry worker',
      expect.any(Function),
    );
  });
});
