jest.mock('uuid', () => ({ v4: jest.fn(() => 'mock-uuid') }));

jest.mock('@librechat/data-schemas', () => ({
  logger: { warn: jest.fn(), debug: jest.fn(), error: jest.fn(), info: jest.fn() },
  runAsSystem: jest.fn((fn) => fn()),
}));

jest.mock('@librechat/agents', () => ({
  Providers: {},
}));

jest.mock('librechat-data-provider', () => {
  const actual = jest.requireActual('librechat-data-provider');
  return {
    ...actual,
    mergeFileConfig: jest.fn(),
  };
});

jest.mock('@librechat/api', () => ({
  sanitizeFilename: jest.fn((n) => n),
  parseText: jest.fn(),
  processAudioFile: jest.fn(),
  getStorageMetadata: jest.fn(() => ({})),
  sweepExpiredFiles: jest.fn(),
  startExpiredFileSweep: jest.fn(),
}));

jest.mock('~/server/services/Files/images', () => ({
  convertImage: jest.fn(),
  resizeAndConvert: jest.fn(),
  resizeImageBuffer: jest.fn(),
}));

jest.mock('~/server/controllers/assistants/v2', () => ({
  addResourceFileId: jest.fn(),
  deleteResourceFileId: jest.fn(),
}));

jest.mock('~/server/controllers/assistants/helpers', () => ({
  getOpenAIClient: jest.fn(),
}));

jest.mock('~/server/services/Tools/credentials', () => ({
  loadAuthValues: jest.fn(),
}));

jest.mock('~/server/utils/getFileStrategy', () => ({
  getFileStrategy: jest.fn().mockReturnValue('local'),
}));

jest.mock('~/server/services/Config', () => ({
  checkCapability: jest.fn().mockResolvedValue(true),
}));

jest.mock('~/server/utils/queue', () => ({
  LB_QueueAsyncCall: jest.fn(),
}));

jest.mock('~/server/services/Files/strategies', () => ({
  getStrategyFunctions: jest.fn(),
}));

jest.mock('~/server/utils', () => ({
  determineFileType: jest.fn(),
}));

jest.mock('~/server/services/Files/Audio/STTService', () => ({
  STTService: { getInstance: jest.fn() },
}));

jest.mock('~/models', () => ({
  getConvoFiles: jest.fn(),
  getMessages: jest.fn(),
  getFiles: jest.fn(),
  findConvosWithFiles: jest.fn(),
  findAgentFileIds: jest.fn(),
}));

const db = require('~/models');
const { getConvoFilesToDelete } = require('./process');

const userId = 'user-1';
const conversationId = 'convo-1';

const fileDoc = (file_id) => ({ file_id, user: userId, source: 'local', filepath: `/x/${file_id}` });

describe('getConvoFilesToDelete', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    db.getConvoFiles.mockResolvedValue([]);
    db.getMessages.mockResolvedValue([]);
    db.getFiles.mockResolvedValue([]);
    db.findConvosWithFiles.mockResolvedValue([]);
    db.findAgentFileIds.mockResolvedValue([]);
  });

  it('returns [] and skips lookups when there are no candidate files', async () => {
    const result = await getConvoFilesToDelete({ userId, conversationId });

    expect(result).toEqual([]);
    expect(db.getFiles).not.toHaveBeenCalled();
    expect(db.findConvosWithFiles).not.toHaveBeenCalled();
    expect(db.findAgentFileIds).not.toHaveBeenCalled();
  });

  it('returns exclusively-owned files from conversation.files and messages', async () => {
    db.getConvoFiles.mockResolvedValue(['fileA']);
    db.getMessages.mockResolvedValue([{ files: [{ file_id: 'fileB' }] }]);
    db.getFiles.mockResolvedValue([fileDoc('fileA'), fileDoc('fileB')]);

    const result = await getConvoFilesToDelete({ userId, conversationId });

    expect(result.map((f) => f.file_id).sort()).toEqual(['fileA', 'fileB']);
    expect(db.getFiles).toHaveBeenCalledWith({
      file_id: { $in: expect.arrayContaining(['fileA', 'fileB']) },
      user: userId,
    });
  });

  it('excludes files still referenced by another conversation', async () => {
    db.getConvoFiles.mockResolvedValue(['fileA', 'fileB']);
    db.getFiles.mockResolvedValue([fileDoc('fileA'), fileDoc('fileB')]);
    db.findConvosWithFiles.mockResolvedValue(['fileB']);

    const result = await getConvoFilesToDelete({ userId, conversationId });

    expect(result.map((f) => f.file_id)).toEqual(['fileA']);
  });

  it('excludes files attached to an agent tool_resource', async () => {
    db.getConvoFiles.mockResolvedValue(['fileA', 'fileB']);
    db.getFiles.mockResolvedValue([fileDoc('fileA'), fileDoc('fileB')]);
    db.findAgentFileIds.mockResolvedValue(['fileA']);

    const result = await getConvoFilesToDelete({ userId, conversationId });

    expect(result.map((f) => f.file_id)).toEqual(['fileB']);
  });

  it('returns [] when the conversation has no files', async () => {
    db.getConvoFiles.mockResolvedValue([]);
    db.getMessages.mockResolvedValue([]);

    const result = await getConvoFilesToDelete({ userId, conversationId });

    expect(result).toEqual([]);
  });

  it('deduplicates a file id present in both conversation.files and a message', async () => {
    db.getConvoFiles.mockResolvedValue(['fileA']);
    db.getMessages.mockResolvedValue([{ files: ['fileA'] }, { files: [{ file_id: 'fileA' }] }]);
    db.getFiles.mockResolvedValue([fileDoc('fileA')]);

    const result = await getConvoFilesToDelete({ userId, conversationId });

    expect(result.map((f) => f.file_id)).toEqual(['fileA']);
    const calledWith = db.getFiles.mock.calls[0][0];
    expect(calledWith.file_id.$in).toEqual(['fileA']);
  });

  it('passes the requesting user to the file lookup (user scoping)', async () => {
    db.getConvoFiles.mockResolvedValue(['fileA']);
    db.getFiles.mockResolvedValue([fileDoc('fileA')]);

    await getConvoFilesToDelete({ userId, conversationId });

    expect(db.getFiles).toHaveBeenCalledWith(
      expect.objectContaining({ user: userId }),
    );
    expect(db.findConvosWithFiles).toHaveBeenCalledWith(
      expect.objectContaining({ user: userId, excludeConversationId: conversationId }),
    );
  });

  it('handles null returns from db methods gracefully', async () => {
    db.getConvoFiles.mockResolvedValue(null);
    db.getMessages.mockResolvedValue(null);
    db.getFiles.mockResolvedValue(null);
    db.findConvosWithFiles.mockResolvedValue(null);
    db.findAgentFileIds.mockResolvedValue(null);

    const result = await getConvoFilesToDelete({ userId, conversationId });
    expect(result).toEqual([]);
  });
});
