const mockRunCodeOutputBatchPreflight = jest.fn();
const mockPrepareCodeOutputForInspection = jest.fn();

jest.mock('@librechat/data-schemas', () => ({
  logger: { warn: jest.fn() },
}));

jest.mock('@librechat/api', () => ({
  preflightCodeOutputBatch: (...args) => mockRunCodeOutputBatchPreflight(...args),
}));

jest.mock('librechat-data-provider', () => ({
  EModelEndpoint: { agents: 'agents' },
  mergeFileConfig: jest.fn(() => ({ serverFileSizeLimit: 32 })),
  getEndpointFileConfig: jest.fn(() => ({
    fileLimit: 4,
    fileSizeLimit: 8,
    totalSizeLimit: 16,
  })),
}));

jest.mock('./process', () => ({
  prepareCodeOutputForInspection: (...args) => mockPrepareCodeOutputForInspection(...args),
}));

const { preflightCodeOutputBatch } = require('./preflight');

describe('preflightCodeOutputBatch Code API routing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrepareCodeOutputForInspection.mockResolvedValue({
      buffer: Buffer.from('safe'),
      file: { name: 'output.txt', content: 'safe' },
    });
    mockRunCodeOutputBatchPreflight.mockImplementation(async ({ prepare }) => {
      await prepare({
        file: { id: 'file-1', name: 'output.txt' },
        sessionId: 'session-1',
        maxBytes: 8,
        inspectContent: true,
      });
      return [];
    });
  });

  it('forwards the trusted per-agent Code API route to inspection downloads', async () => {
    const req = { config: {}, user: { id: 'user-1' } };

    await preflightCodeOutputBatch({
      req,
      artifact: { files: [{ id: 'file-1', name: 'output.txt' }] },
      codeExecutionContext: {
        baseUrl: 'https://code-stateful.example.com',
        executionProfile: 'stateful',
        executionRouteKey: 'stateful:route',
      },
    });

    expect(mockPrepareCodeOutputForInspection).toHaveBeenCalledWith({
      req,
      id: 'file-1',
      name: 'output.txt',
      session_id: 'session-1',
      maxBytes: 8,
      inspectContent: true,
      codeApiBaseUrl: 'https://code-stateful.example.com',
      executionProfile: 'stateful',
      executionRouteKey: 'stateful:route',
    });
  });
});
