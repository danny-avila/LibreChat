jest.mock('uuid', () => ({ v4: jest.fn(() => 'mock-uuid') }));

jest.mock('@librechat/data-schemas', () => ({
  logger: { warn: jest.fn(), debug: jest.fn(), error: jest.fn() },
}));

jest.mock('@librechat/agents', () => ({
  getCodeBaseURL: jest.fn(() => 'http://localhost:8000'),
}));

const mockSanitizeFilename = jest.fn();

jest.mock('@librechat/api', () => ({
  logAxiosError: jest.fn(),
  getBasePath: jest.fn(() => ''),
  sanitizeFilename: mockSanitizeFilename,
}));

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

jest.mock('axios', () =>
  jest.fn().mockResolvedValue({
    data: Buffer.from('file-content'),
  }),
);

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

  test('sanitizeFilename is called with the raw artifact name', async () => {
    mockSanitizeFilename.mockReturnValueOnce('output.csv');
    await processCodeOutput({ ...baseParams, name: 'output.csv' });
    expect(mockSanitizeFilename).toHaveBeenCalledWith('output.csv');
  });

  test('sanitized name is used in saveBuffer fileName', async () => {
    mockSanitizeFilename.mockReturnValueOnce('sanitized-name.txt');
    await processCodeOutput({ ...baseParams, name: '../../../tmp/poc.txt' });

    expect(mockSanitizeFilename).toHaveBeenCalledWith('../../../tmp/poc.txt');
    const call = mockSaveBuffer.mock.calls[0][0];
    expect(call.fileName).toBe('mock-uuid__sanitized-name.txt');
  });

  test('sanitized name is stored as filename in the file record', async () => {
    mockSanitizeFilename.mockReturnValueOnce('safe-output.csv');
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

    mockSanitizeFilename.mockReturnValueOnce('safe-chart.png');
    await processCodeOutput({ ...baseParams, name: '../../../chart.png' });

    expect(mockSanitizeFilename).toHaveBeenCalledWith('../../../chart.png');
    const fileArg = createFile.mock.calls[0][0];
    expect(fileArg.filename).toBe('safe-chart.png');
  });
});
