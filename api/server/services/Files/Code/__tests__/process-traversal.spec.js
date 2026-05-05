jest.mock('uuid', () => ({ v4: jest.fn(() => 'mock-uuid') }));

jest.mock('@librechat/data-schemas', () => ({
  logger: { warn: jest.fn(), debug: jest.fn(), error: jest.fn() },
}));

jest.mock('@librechat/agents', () => ({
  getCodeBaseURL: jest.fn(() => 'http://localhost:8000'),
}));

const mockSanitizeArtifactPath = jest.fn();
const mockFlattenArtifactPath = jest.fn((name) => name.replace(/\//g, '__'));

const mockAxios = jest.fn().mockResolvedValue({
  data: Buffer.from('file-content'),
});
mockAxios.post = jest.fn();

jest.mock('@librechat/api', () => {
  const http = require('http');
  const https = require('https');
  return {
    logAxiosError: jest.fn(),
    getBasePath: jest.fn(() => ''),
    sanitizeArtifactPath: mockSanitizeArtifactPath,
    flattenArtifactPath: mockFlattenArtifactPath,
    createAxiosInstance: jest.fn(() => mockAxios),
    classifyCodeArtifact: jest.fn(() => 'other'),
    extractCodeArtifactText: jest.fn(async () => null),
    /* `processCodeOutput` calls this to derive the trust flag persisted
     * on `IMongoFile.textFormat` — Codex P1 review on PR #12934. The
     * mock returns null in lockstep with the null `text` above so
     * downstream consumers don't see a phantom format. */
    getExtractedTextFormat: jest.fn(() => null),
    codeServerHttpAgent: new http.Agent({ keepAlive: false }),
    codeServerHttpsAgent: new https.Agent({ keepAlive: false }),
  };
});

jest.mock('librechat-data-provider', () => ({
  ...jest.requireActual('librechat-data-provider'),
  mergeFileConfig: jest.fn(() => ({ serverFileSizeLimit: 100 * 1024 * 1024 })),
  getEndpointFileConfig: jest.fn(() => ({
    fileSizeLimit: 100 * 1024 * 1024,
    supportedMimeTypes: ['*/*'],
  })),
  fileConfig: { checkType: jest.fn(() => true) },
}));

jest.mock('~/models', () => ({
  createFile: jest.fn().mockResolvedValue({}),
  getFiles: jest.fn().mockResolvedValue([]),
  updateFile: jest.fn(),
  claimCodeFile: jest.fn().mockResolvedValue({ file_id: 'mock-uuid', usage: 0 }),
}));

const mockSaveBuffer = jest.fn().mockResolvedValue('/uploads/user123/mock-uuid__output.csv');

jest.mock('~/server/services/Files/strategies', () => ({
  getStrategyFunctions: jest.fn(() => ({
    saveBuffer: mockSaveBuffer,
  })),
}));

jest.mock('~/server/services/Files/permissions', () => ({
  filterFilesByAgentAccess: jest.fn().mockResolvedValue([]),
}));

jest.mock('~/server/services/Files/images/convert', () => ({
  convertImage: jest.fn(),
}));

jest.mock('~/server/utils', () => ({
  determineFileType: jest.fn().mockResolvedValue({ mime: 'text/csv' }),
}));

const { createFile } = require('~/models');
const { processCodeOutput } = require('../process');

const baseParams = {
  req: {
    user: { id: 'user123' },
    config: {
      fileStrategy: 'local',
      imageOutputType: 'webp',
      fileConfig: {},
    },
  },
  id: 'code-file-id',
  apiKey: 'test-key',
  toolCallId: 'tool-1',
  conversationId: 'conv-1',
  messageId: 'msg-1',
  session_id: 'session-1',
};

describe('processCodeOutput path traversal protection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('sanitizeArtifactPath is called with the raw artifact name', async () => {
    mockSanitizeArtifactPath.mockReturnValueOnce('output.csv');
    await processCodeOutput({ ...baseParams, name: 'output.csv' });
    expect(mockSanitizeArtifactPath).toHaveBeenCalledWith('output.csv');
  });

  test('sanitized name is used in saveBuffer fileName (and flattened to a single component)', async () => {
    mockSanitizeArtifactPath.mockReturnValueOnce('sanitized-name.txt');
    await processCodeOutput({ ...baseParams, name: '../../../tmp/poc.txt' });

    expect(mockSanitizeArtifactPath).toHaveBeenCalledWith('../../../tmp/poc.txt');
    const call = mockSaveBuffer.mock.calls[0][0];
    /* `flattenArtifactPath` is identity for already-flat names; the assert
     * is against the storage-key composition (`<file_id>__<flat>`). */
    expect(call.fileName).toBe('mock-uuid__sanitized-name.txt');
  });

  test('sanitized name is stored as filename in the file record', async () => {
    mockSanitizeArtifactPath.mockReturnValueOnce('safe-output.csv');
    await processCodeOutput({ ...baseParams, name: 'unsafe/../../output.csv' });

    const fileArg = createFile.mock.calls[0][0];
    expect(fileArg.filename).toBe('safe-output.csv');
  });

  test('sanitized name is used for image file records', async () => {
    const { convertImage } = require('~/server/services/Files/images/convert');
    convertImage.mockResolvedValueOnce({
      filepath: '/images/user123/mock-uuid.webp',
      bytes: 100,
    });

    mockSanitizeArtifactPath.mockReturnValueOnce('safe-chart.png');
    await processCodeOutput({ ...baseParams, name: '../../../chart.png' });

    expect(mockSanitizeArtifactPath).toHaveBeenCalledWith('../../../chart.png');
    const fileArg = createFile.mock.calls[0][0];
    expect(fileArg.filename).toBe('safe-chart.png');
  });
});
