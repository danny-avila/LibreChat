const mockConnect = jest.fn().mockResolvedValue(true);
const mockCreateCollections = jest.fn().mockResolvedValue(undefined);
const mockCreateIndexes = jest.fn().mockResolvedValue([]);
const mockBackfill = jest.fn().mockResolvedValue({ scannedServers: 0 });
const mockReadiness = jest.fn().mockResolvedValue({ scannedServers: 0, indexes: [] });
const mockInspectStatus = jest.fn();
const mockGetStatus = jest.fn();
const mockMutate = jest.fn();
const mockReconcile = jest.fn();

jest.mock('../connect', () => mockConnect);
jest.mock('@librechat/data-schemas', () => ({
  assertMCPAuthorityReadiness: mockReadiness,
  createMCPAuthorityProofCollections: mockCreateCollections,
  createMCPAuthorityLookupIndexes: mockCreateIndexes,
  backfillMCPServerNormalizedNames: mockBackfill,
  getMCPAuthorityConsistencyModule: () => ({
    inspectMCPAuthorityConsistencyStatus: mockInspectStatus,
    getMCPAuthorityConsistencyStatus: mockGetStatus,
    mutateMCPAuthority: mockMutate,
    reconcileMCPAuthorityConsistency: mockReconcile,
  }),
}));

const { migrateMCPAuthority } = require('../migrate-mcp-authority');

describe('MCP authority migration checks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMutate.mockImplementation(async (mutation) => ({
      generation: 1,
      result: await mutation(),
    }));
    mockReconcile.mockResolvedValue({ generation: 4 });
    mockInspectStatus.mockResolvedValue({
      generation: 3,
      dirty: false,
      updatedAt: new Date('2026-08-08T12:00:00.000Z'),
    });
  });

  it('checks an existing consistency fence without initializing or mutating it', async () => {
    await expect(migrateMCPAuthority({ checkOnly: true })).resolves.toMatchObject({
      consistencyGeneration: 3,
    });

    expect(mockInspectStatus).toHaveBeenCalledTimes(1);
    expect(mockGetStatus).not.toHaveBeenCalled();
    expect(mockCreateCollections).not.toHaveBeenCalled();
    expect(mockBackfill).not.toHaveBeenCalled();
    expect(mockCreateIndexes).not.toHaveBeenCalled();
  });

  it('reports an uninitialized fence in check-only mode without creating it', async () => {
    mockInspectStatus.mockResolvedValue(null);

    await expect(migrateMCPAuthority({ checkOnly: true })).rejects.toThrow(
      'MCP authority consistency fence is not initialized',
    );

    expect(mockInspectStatus).toHaveBeenCalledTimes(1);
    expect(mockGetStatus).not.toHaveBeenCalled();
  });

  it('publishes normalized-name backfills through the authority fence', async () => {
    mockGetStatus.mockResolvedValue({
      generation: 1,
      dirty: false,
      updatedAt: new Date('2026-08-08T12:00:00.000Z'),
    });

    await expect(migrateMCPAuthority()).resolves.toMatchObject({
      consistencyGeneration: 1,
    });

    expect(mockCreateCollections).toHaveBeenCalledTimes(1);
    expect(mockMutate).toHaveBeenCalledTimes(1);
    expect(mockBackfill).toHaveBeenCalledTimes(1);
    expect(mockMutate.mock.invocationCallOrder[0]).toBeLessThan(
      mockBackfill.mock.invocationCallOrder[0],
    );
    expect(mockBackfill.mock.invocationCallOrder[0]).toBeLessThan(
      mockCreateIndexes.mock.invocationCallOrder[0],
    );
  });

  it('reports a dirty fence before attempting migration writes', async () => {
    mockGetStatus.mockResolvedValue({
      generation: 3,
      dirty: true,
      ownerId: 'writer-1',
      updatedAt: new Date('2026-08-08T12:00:00.000Z'),
    });

    await expect(migrateMCPAuthority()).rejects.toThrow('confirm-writer-stopped');

    expect(mockCreateCollections).not.toHaveBeenCalled();
    expect(mockMutate).not.toHaveBeenCalled();
    expect(mockBackfill).not.toHaveBeenCalled();
  });

  it('reconciles the exact dirty owner before running the repaired migration', async () => {
    const reconciliation = { expectedOwnerId: 'writer-1', expectedGeneration: 3 };
    mockGetStatus
      .mockResolvedValueOnce({
        generation: 3,
        dirty: true,
        ownerId: 'writer-1',
        updatedAt: new Date('2026-08-08T12:00:00.000Z'),
      })
      .mockResolvedValueOnce({
        generation: 5,
        dirty: false,
        updatedAt: new Date('2026-08-08T12:01:00.000Z'),
      });

    await expect(migrateMCPAuthority({ reconciliation })).resolves.toMatchObject({
      consistencyGeneration: 5,
    });

    expect(mockReconcile).toHaveBeenCalledWith(reconciliation);
    expect(mockReconcile.mock.invocationCallOrder[0]).toBeLessThan(
      mockMutate.mock.invocationCallOrder[0],
    );
    expect(mockBackfill).toHaveBeenCalledTimes(1);
  });
});
