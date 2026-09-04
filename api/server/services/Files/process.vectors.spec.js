jest.mock('~/models', () => ({
  createFile: jest.fn(async (data) => ({ ...data })),
  updateFileUsage: jest.fn(),
  deleteFiles: jest.fn().mockResolvedValue({ deletedCount: 1 }),
  findFileById: jest.fn(),
  getConvo: jest.fn(),
  getAgent: jest.fn().mockResolvedValue(null),
  getExpiredFiles: jest.fn(),
  addAgentResourceFile: jest.fn().mockResolvedValue({}),
  removeAgentResourceFiles: jest.fn(),
  removeAgentResourceFilesFromAllAgents: jest.fn(),
  findVectorReuseCandidates: jest.fn().mockResolvedValue([]),
  countVectorReferences: jest.fn().mockResolvedValue(new Map()),
}));

jest.mock('~/server/services/Files/strategies', () => ({
  getStrategyFunctions: jest.fn(),
}));

jest.mock('./VectorDB/crud', () => ({
  uploadVectors: jest.fn().mockResolvedValue({
    bytes: 42,
    filename: 'upload.bin',
    filepath: 'vectordb',
    embedded: true,
  }),
  deleteVectors: jest.fn(),
}));

jest.mock('~/server/utils/getFileStrategy', () => ({
  getFileStrategy: jest.fn().mockReturnValue('local'),
}));

jest.mock('~/server/services/Config', () => ({
  checkCapability: jest.fn().mockResolvedValue(true),
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

jest.mock('~/server/services/Files/Audio/STTService', () => ({
  STTService: { getInstance: jest.fn() },
}));

jest.mock('~/server/utils/queue', () => ({
  LB_QueueAsyncCall: jest.fn(),
}));

const os = require('os');
const fs = require('fs');
const path = require('path');
const { createHash } = require('crypto');
const { EToolResources, FileContext, FileSources } = require('librechat-data-provider');
const { getStrategyFunctions } = require('~/server/services/Files/strategies');
const { uploadVectors } = require('./VectorDB/crud');
const db = require('~/models');
const { processAgentFileUpload, processDeleteRequest } = require('./process');

const CONTENTS = 'the same document, uploaded twice';
const CONTENT_HASH = createHash('sha256').update(CONTENTS).digest('hex');

let fixtureDir;
let uploadPath;

const makeReq = (overrides = {}) => ({
  user: { id: 'user-123', tenantId: 'tenant-a' },
  file: {
    path: uploadPath,
    originalname: 'report.pdf',
    filename: 'report-uuid.pdf',
    mimetype: 'application/pdf',
    size: CONTENTS.length,
  },
  body: {},
  config: { fileConfig: {}, fileStrategy: 'local' },
  ...overrides,
});

const makeRes = () => {
  const res = { status: jest.fn(() => res), json: jest.fn(() => res) };
  return res;
};

const uploadedFile = () => db.createFile.mock.calls[0][0];
const respondedWith = (res) => res.json.mock.calls[0][0];

const seedStorage = () =>
  getStrategyFunctions.mockReturnValue({
    handleFileUpload: jest.fn().mockResolvedValue({
      bytes: 42,
      filename: 'report.pdf',
      filepath: '/uploads/report.pdf',
    }),
  });

const attachmentMetadata = (overrides = {}) => ({
  file_id: 'new-file-id',
  temp_file_id: 'temp-abc',
  tool_resource: EToolResources.file_search,
  message_file: true,
  ...overrides,
});

const agentMetadata = (overrides = {}) => ({
  file_id: 'new-file-id',
  temp_file_id: 'temp-abc',
  agent_id: 'agent-abc',
  tool_resource: EToolResources.file_search,
  ...overrides,
});

beforeAll(() => {
  fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'process-vectors-spec-'));
  uploadPath = path.join(fixtureDir, 'report.pdf');
  fs.writeFileSync(uploadPath, CONTENTS);
});

afterAll(() => {
  fs.rmSync(fixtureDir, { recursive: true, force: true });
});

beforeEach(() => {
  jest.clearAllMocks();
  db.findVectorReuseCandidates.mockResolvedValue([]);
  db.countVectorReferences.mockResolvedValue(new Map());
  db.getAgent.mockResolvedValue(null);
  seedStorage();
});

describe('file_search uploads with no prior copy', () => {
  it('embeds the file and records its content hash', async () => {
    const res = makeRes();

    await processAgentFileUpload({ req: makeReq(), res, metadata: attachmentMetadata() });

    expect(uploadVectors).toHaveBeenCalledTimes(1);
    expect(uploadedFile()).toEqual(
      expect.objectContaining({
        hash: CONTENT_HASH,
        vectorOwner: 'user-123',
        embedded: true,
        file_id: 'new-file-id',
      }),
    );
    expect(uploadedFile().vectorId).toBeUndefined();
  });

  it('looks for prior copies under the uploading user, type and attachment context', async () => {
    await processAgentFileUpload({
      req: makeReq(),
      res: makeRes(),
      metadata: attachmentMetadata(),
    });

    expect(db.findVectorReuseCandidates).toHaveBeenCalledWith({
      hash: CONTENT_HASH,
      type: 'application/pdf',
      context: FileContext.message_attachment,
      extension: '.pdf',
      vectorOwner: 'user-123',
      tenantId: 'tenant-a',
    });
  });

  it('resolves the reuse source only after the file is safely stored', async () => {
    const order = [];
    getStrategyFunctions.mockReturnValue({
      handleFileUpload: jest.fn(async () => {
        order.push('storage');
        return { bytes: 42, filename: 'report.pdf', filepath: '/uploads/report.pdf' };
      }),
    });
    db.findVectorReuseCandidates.mockImplementation(async () => {
      order.push('lookup');
      return [];
    });

    await processAgentFileUpload({
      req: makeReq(),
      res: makeRes(),
      metadata: attachmentMetadata(),
    });

    expect(order).toEqual(['storage', 'lookup']);
  });

  it('leaves uploads outside file_search unhashed', async () => {
    await processAgentFileUpload({
      req: makeReq({
        file: {
          path: uploadPath,
          originalname: 'notes.txt',
          filename: 'notes-uuid.txt',
          mimetype: 'text/plain',
          size: CONTENTS.length,
        },
      }),
      res: makeRes(),
      metadata: { file_id: 'new-file-id', temp_file_id: 'temp-abc', message_file: true },
    });

    expect(db.findVectorReuseCandidates).not.toHaveBeenCalled();
    expect(uploadVectors).not.toHaveBeenCalled();
    expect(uploadedFile().hash).toBeUndefined();
  });
});

describe('re-uploading identical content as a chat attachment', () => {
  const priorCopy = {
    file_id: 'original-file-id',
    filename: 'report.pdf',
    hash: CONTENT_HASH,
    embedded: true,
    context: FileContext.message_attachment,
  };

  it('reuses the existing vectors instead of embedding again', async () => {
    db.findVectorReuseCandidates.mockResolvedValue([priorCopy]);
    const res = makeRes();

    await processAgentFileUpload({ req: makeReq(), res, metadata: attachmentMetadata() });

    expect(uploadVectors).not.toHaveBeenCalled();
    expect(uploadedFile()).toEqual(
      expect.objectContaining({
        file_id: 'new-file-id',
        vectorId: 'original-file-id',
        hash: CONTENT_HASH,
        embedded: true,
      }),
    );
  });

  it('still stores its own copy so the record deletes independently', async () => {
    db.findVectorReuseCandidates.mockResolvedValue([priorCopy]);
    const handleFileUpload = jest.fn().mockResolvedValue({
      bytes: 42,
      filename: 'report.pdf',
      filepath: '/uploads/report.pdf',
    });
    getStrategyFunctions.mockReturnValue({ handleFileUpload });

    await processAgentFileUpload({
      req: makeReq(),
      res: makeRes(),
      metadata: attachmentMetadata(),
    });

    expect(handleFileUpload).toHaveBeenCalledTimes(1);
    expect(uploadedFile().filepath).toBe('/uploads/report.pdf');
  });

  it('follows a borrowed reference back to the file that owns the vectors', async () => {
    db.findVectorReuseCandidates.mockResolvedValue([
      { ...priorCopy, file_id: 'borrower', vectorId: 'original-file-id' },
    ]);

    await processAgentFileUpload({
      req: makeReq(),
      res: makeRes(),
      metadata: attachmentMetadata(),
    });

    expect(uploadedFile().vectorId).toBe('original-file-id');
  });

  it('keeps the name the user just uploaded', async () => {
    db.findVectorReuseCandidates.mockResolvedValue([{ ...priorCopy, filename: 'old-name.pdf' }]);
    getStrategyFunctions.mockReturnValue({
      handleFileUpload: jest.fn().mockResolvedValue({
        bytes: 42,
        filename: 'report.pdf',
        filepath: '/uploads/report.pdf',
      }),
    });

    await processAgentFileUpload({
      req: makeReq(),
      res: makeRes(),
      metadata: attachmentMetadata(),
    });

    expect(uploadedFile().filename).toBe('report.pdf');
  });
});

describe('re-uploading identical content to an agent', () => {
  const knowledgeFile = {
    file_id: 'agent-file-id',
    filename: 'report.pdf',
    hash: CONTENT_HASH,
    embedded: true,
    vectorOwner: 'agent-abc',
    context: FileContext.agents,
  };

  it('reuses the agent vectors instead of embedding again', async () => {
    db.findVectorReuseCandidates.mockResolvedValue([knowledgeFile]);

    await processAgentFileUpload({ req: makeReq(), res: makeRes(), metadata: agentMetadata() });

    expect(uploadVectors).not.toHaveBeenCalled();
    expect(uploadedFile()).toEqual(
      expect.objectContaining({
        file_id: 'new-file-id',
        vectorId: 'agent-file-id',
        vectorOwner: 'agent-abc',
      }),
    );
    expect(db.addAgentResourceFile).toHaveBeenCalled();
  });

  it('reuses knowledge another editor uploaded to the same agent', async () => {
    db.findVectorReuseCandidates.mockResolvedValue([
      { ...knowledgeFile, user: 'a-different-editor' },
    ]);

    await processAgentFileUpload({ req: makeReq(), res: makeRes(), metadata: agentMetadata() });

    expect(uploadVectors).not.toHaveBeenCalled();
    expect(uploadedFile().vectorId).toBe('agent-file-id');
  });

  /* The agent's own id is the scope, so no agent read is needed to find its
   * knowledge — and being listed by an agent never implies it owns the vectors. */
  it('scopes the search to the agent that owns the vectors', async () => {
    await processAgentFileUpload({ req: makeReq(), res: makeRes(), metadata: agentMetadata() });

    expect(db.getAgent).not.toHaveBeenCalled();
    expect(db.findVectorReuseCandidates).toHaveBeenCalledWith({
      hash: CONTENT_HASH,
      type: 'application/pdf',
      context: FileContext.agents,
      extension: '.pdf',
      vectorOwner: 'agent-abc',
      tenantId: 'tenant-a',
    });
  });

  it('embeds when the agent owns nothing matching', async () => {
    await processAgentFileUpload({ req: makeReq(), res: makeRes(), metadata: agentMetadata() });

    expect(uploadVectors).toHaveBeenCalledTimes(1);
    expect(uploadedFile().vectorId).toBeUndefined();
    expect(uploadedFile().vectorOwner).toBe('agent-abc');
  });

  it('always persists a record of its own so the upload is never a silent no-op', async () => {
    db.findVectorReuseCandidates.mockResolvedValue([knowledgeFile]);
    const res = makeRes();

    await processAgentFileUpload({ req: makeReq(), res, metadata: agentMetadata() });

    expect(db.createFile).toHaveBeenCalledTimes(1);
    expect(respondedWith(res)).toEqual(expect.objectContaining({ file_id: 'new-file-id' }));
  });
});

describe('content whose extension changes how the RAG API parses it', () => {
  /* The extension is part of the persisted reuse key, so records chunked by a
   * different loader never reach the caller. */
  it('asks only for candidates the same loader produced', async () => {
    db.findVectorReuseCandidates.mockImplementation(async ({ extension }) =>
      extension === '.csv'
        ? [{ file_id: 'as-csv', hash: CONTENT_HASH, embedded: true, vectorOwner: 'user-123' }]
        : [],
    );

    await processAgentFileUpload({
      req: makeReq(),
      res: makeRes(),
      metadata: attachmentMetadata(),
    });

    expect(db.findVectorReuseCandidates).toHaveBeenCalledWith(
      expect.objectContaining({ extension: '.pdf' }),
    );
    expect(uploadVectors).toHaveBeenCalledTimes(1);
    expect(uploadedFile().vectorId).toBeUndefined();
  });

  it('records the extension the RAG API parsed it under', async () => {
    await processAgentFileUpload({
      req: makeReq(),
      res: makeRes(),
      metadata: attachmentMetadata(),
    });

    expect(uploadedFile().vectorExtension).toBe('.pdf');
  });
});

describe('deleting files that share vectors', () => {
  const deleteReq = () => ({
    body: {},
    config: {},
    user: { id: 'user-123', tenantId: 'tenant-a' },
  });

  const setupDeletes = () => {
    const primaryDelete = jest.fn().mockResolvedValue(undefined);
    const vectorDelete = jest.fn().mockResolvedValue(undefined);
    getStrategyFunctions.mockImplementation((source) =>
      source === FileSources.vectordb
        ? { deleteFile: vectorDelete }
        : { deleteFile: primaryDelete },
    );
    return { primaryDelete, vectorDelete };
  };

  it('keeps vectors alive while another record still borrows them', async () => {
    const { vectorDelete } = setupDeletes();
    db.countVectorReferences.mockResolvedValue(new Map([['original-file-id', 1]]));

    const result = await processDeleteRequest({
      req: deleteReq(),
      files: [
        {
          file_id: 'borrower',
          filepath: '/uploads/report.pdf',
          source: FileSources.local,
          embedded: true,
          vectorId: 'original-file-id',
        },
      ],
    });

    expect(vectorDelete).not.toHaveBeenCalled();
    expect(result.deletedFileIds).toEqual(['borrower']);
    expect(db.deleteFiles).toHaveBeenCalledWith(['borrower']);
  });

  it('drops vectors once the last reference goes', async () => {
    const { vectorDelete } = setupDeletes();

    await processDeleteRequest({
      req: deleteReq(),
      files: [
        {
          file_id: 'borrower',
          filepath: '/uploads/report.pdf',
          source: FileSources.local,
          embedded: true,
          vectorId: 'original-file-id',
        },
      ],
    });

    expect(vectorDelete).toHaveBeenCalledTimes(1);
    expect(vectorDelete.mock.calls[0][1]).toEqual(
      expect.objectContaining({ vectorId: 'original-file-id', embedded: true }),
    );
  });

  const sharedGroup = () => [
    {
      file_id: 'original-file-id',
      filepath: '/uploads/a.pdf',
      source: FileSources.local,
      embedded: true,
    },
    {
      file_id: 'borrower',
      filepath: '/uploads/b.pdf',
      source: FileSources.local,
      embedded: true,
      vectorId: 'original-file-id',
    },
  ];

  it('deletes shared vectors exactly once when the whole group goes at once', async () => {
    const { vectorDelete } = setupDeletes();

    await processDeleteRequest({ req: deleteReq(), files: sharedGroup() });

    expect(db.countVectorReferences).toHaveBeenNthCalledWith(1, {
      vectorIds: ['original-file-id'],
      excludeFileIds: ['original-file-id', 'borrower'],
    });
    expect(vectorDelete).toHaveBeenCalledTimes(1);
    expect(vectorDelete.mock.calls[0][1].file_id).toBe('original-file-id');
  });

  /* A partial storage failure keeps the failed record, so the document it
   * shares with its deleted sibling has to survive with it. */
  it('keeps shared vectors when a sibling in the batch fails to delete', async () => {
    const vectorDelete = jest.fn().mockResolvedValue(undefined);
    const primaryDelete = jest.fn(async (_req, file) => {
      if (file.file_id === 'borrower') {
        throw new Error('S3 unavailable');
      }
    });
    getStrategyFunctions.mockImplementation((source) =>
      source === FileSources.vectordb
        ? { deleteFile: vectorDelete }
        : { deleteFile: primaryDelete },
    );
    db.countVectorReferences
      .mockResolvedValueOnce(new Map())
      .mockResolvedValueOnce(new Map([['original-file-id', 1]]));

    const result = await processDeleteRequest({ req: deleteReq(), files: sharedGroup() });

    expect(result.deletedFileIds).toEqual(['original-file-id']);
    expect(result.failedFileIds).toEqual(['borrower']);
    expect(vectorDelete).not.toHaveBeenCalled();
  });

  it('leaves unshared embedded files deleting as before', async () => {
    const { vectorDelete } = setupDeletes();

    await processDeleteRequest({
      req: deleteReq(),
      files: [
        {
          file_id: 'solo',
          filepath: '/uploads/solo.pdf',
          source: FileSources.local,
          embedded: true,
        },
      ],
    });

    expect(vectorDelete).toHaveBeenCalledTimes(1);
  });

  it('never counts references for a batch with nothing embedded', async () => {
    setupDeletes();

    await processDeleteRequest({
      req: deleteReq(),
      files: [{ file_id: 'plain', filepath: '/uploads/x.png', source: FileSources.local }],
    });

    expect(db.countVectorReferences).not.toHaveBeenCalled();
  });

  /* Two concurrent deletes of files sharing a document each see the other and
   * stand down; the recheck after this request's records are gone is what
   * stops the embeddings being stranded. */
  it('reclaims a document whose last reference went while the delete ran', async () => {
    const { vectorDelete } = setupDeletes();
    db.countVectorReferences
      .mockResolvedValueOnce(new Map([['original-file-id', 1]]))
      .mockResolvedValueOnce(new Map());

    await processDeleteRequest({
      req: deleteReq(),
      files: [
        {
          file_id: 'borrower',
          filepath: '/uploads/report.pdf',
          source: FileSources.local,
          embedded: true,
          vectorId: 'original-file-id',
        },
      ],
    });

    expect(db.countVectorReferences).toHaveBeenLastCalledWith({
      vectorIds: ['original-file-id'],
    });
    expect(vectorDelete).toHaveBeenCalledTimes(1);
    expect(vectorDelete.mock.calls[0][1]).toEqual({
      file_id: 'original-file-id',
      embedded: true,
    });
  });

  it('leaves the document alone when the other reference is still there', async () => {
    const { vectorDelete } = setupDeletes();
    db.countVectorReferences.mockResolvedValue(new Map([['original-file-id', 1]]));

    await processDeleteRequest({
      req: deleteReq(),
      files: [
        {
          file_id: 'borrower',
          filepath: '/uploads/report.pdf',
          source: FileSources.local,
          embedded: true,
          vectorId: 'original-file-id',
        },
      ],
    });

    expect(vectorDelete).not.toHaveBeenCalled();
  });

  it('does not fail a completed delete when the reclaim errors', async () => {
    setupDeletes();
    db.countVectorReferences
      .mockResolvedValueOnce(new Map([['original-file-id', 1]]))
      .mockRejectedValueOnce(new Error('mongo blip'));

    const result = await processDeleteRequest({
      req: deleteReq(),
      files: [
        {
          file_id: 'borrower',
          filepath: '/uploads/report.pdf',
          source: FileSources.local,
          embedded: true,
          vectorId: 'original-file-id',
        },
      ],
    });

    expect(result.deletedFileIds).toEqual(['borrower']);
  });
});
