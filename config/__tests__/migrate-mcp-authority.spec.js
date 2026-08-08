const mockConnect = jest.fn().mockResolvedValue(true);
const mockCreateCollections = jest.fn().mockResolvedValue(undefined);
const mockCreateIndexes = jest.fn().mockResolvedValue([]);
const mockBackfill = jest.fn().mockResolvedValue({ scannedServers: 0 });
const mockReadiness = jest.fn().mockResolvedValue({ scannedServers: 0, indexes: [] });
const mockInspectStatus = jest.fn();
const mockGetStatus = jest.fn();

jest.mock('../connect', () => mockConnect);
jest.mock('@librechat/data-schemas', () => ({
  assertMCPAuthorityReadiness: mockReadiness,
  createMCPAuthorityProofCollections: mockCreateCollections,
  createMCPAuthorityLookupIndexes: mockCreateIndexes,
  backfillMCPServerNormalizedNames: mockBackfill,
  getMCPAuthorityConsistencyModule: () => ({
    inspectMCPAuthorityConsistencyStatus: mockInspectStatus,
    getMCPAuthorityConsistencyStatus: mockGetStatus,
  }),
}));

const { migrateMCPAuthority } = require('../migrate-mcp-authority');

describe('MCP authority migration checks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
});
