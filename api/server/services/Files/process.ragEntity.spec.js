/**
 * Agent knowledge-base files are embedded in the vector store under the
 * agent's id, not the uploader's. A delete that names only the user matches
 * nothing, so the chunks survive the file record — silently, because the RAG
 * API answers `404` and the caller treats that as "already gone".
 *
 * These tests run the real delete service against an in-memory Mongo so the
 * entity resolution, the token claims and the outgoing request are all
 * exercised together.
 */

const axios = require('axios');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { FileSources } = require('librechat-data-provider');
const { agentSchema, fileSchema, createMethods } = require('@librechat/data-schemas');

jest.mock('axios');

jest.mock('@librechat/data-schemas', () => {
  const actual = jest.requireActual('@librechat/data-schemas');
  return {
    ...actual,
    logger: { warn: jest.fn(), debug: jest.fn(), error: jest.fn(), info: jest.fn() },
  };
});

jest.mock('@librechat/agents', () => ({
  EnvVar: { CODE_API_KEY: 'CODE_API_KEY' },
}));

jest.mock('@librechat/api', () => ({
  RagScopes: { embed: 'rag:embed', rerank: 'rag:rerank' },
  generateShortLivedToken: jest.fn(() => 'mock-jwt-token'),
  logAxiosError: jest.fn(),
  sanitizeFilename: jest.fn((n) => n),
  parseText: jest.fn().mockResolvedValue({ text: '', bytes: 0 }),
  processAudioFile: jest.fn(),
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

jest.mock('~/server/services/Config', () => ({
  checkCapability: jest.fn().mockResolvedValue(true),
}));

jest.mock('~/cache', () => ({
  getLogStores: jest.fn(() => ({ get: jest.fn(), set: jest.fn(), delete: jest.fn() })),
}));

const mockPrimaryDeleteFile = jest.fn().mockResolvedValue(undefined);

jest.mock('~/server/services/Files/strategies', () => {
  const { FileSources } = require('librechat-data-provider');
  return {
    getStrategyFunctions: jest.fn((source) => {
      if (source === FileSources.vectordb) {
        const { deleteVectors } = require('~/server/services/Files/VectorDB/crud');
        return { deleteFile: deleteVectors };
      }
      return { deleteFile: mockPrimaryDeleteFile };
    }),
  };
});

jest.mock('~/models', () => {
  const mongoose = require('mongoose');
  const { createMethods } = require('@librechat/data-schemas');
  return createMethods(mongoose, {
    removeAllPermissions: jest.fn().mockResolvedValue(undefined),
  });
});

require('module-alias/register');
const { processDeleteRequest } = require('./process');
const { generateShortLivedToken } = require('@librechat/api');

describe('processDeleteRequest — agent knowledge-base scoping', () => {
  let mongoServer;
  let Agent;
  let File;
  const ORIGINAL_RAG_API_URL = process.env.RAG_API_URL;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
    Agent = mongoose.models.Agent || mongoose.model('Agent', agentSchema);
    File = mongoose.models.File || mongoose.model('File', fileSchema);
    createMethods(mongoose, { removeAllPermissions: jest.fn() });
  }, 30000);

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
    if (ORIGINAL_RAG_API_URL === undefined) {
      delete process.env.RAG_API_URL;
    } else {
      process.env.RAG_API_URL = ORIGINAL_RAG_API_URL;
    }
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    generateShortLivedToken.mockReturnValue('mock-jwt-token');
    axios.delete.mockResolvedValue({ status: 200 });
    process.env.RAG_API_URL = 'http://rag-api.test';
    await Agent.deleteMany({});
    await File.deleteMany({});
  });

  const seedFile = async (file_id, userId, source = FileSources.vectordb) =>
    File.create({
      file_id,
      user: userId,
      filename: `${file_id}.pdf`,
      filepath: `/tmp/${file_id}`,
      object: 'file',
      type: 'application/pdf',
      bytes: 1,
      embedded: true,
      source,
    });

  const seedAgent = async (authorId, file_ids) =>
    Agent.create({
      id: `agent_${Math.random().toString(36).slice(2, 10)}`,
      name: 'Knowledge Agent',
      provider: 'test',
      model: 'test-model',
      author: authorId,
      tool_resources: { file_search: { file_ids } },
    });

  const buildReq = (fileDocs, user) => ({
    user,
    body: { files: fileDocs },
    config: { fileStrategy: 'local', fileConfig: {}, endpoints: {} },
  });

  const deleteCall = () => axios.delete.mock.calls[0];

  test('names the owning agent on the vector delete and in the token', async () => {
    const userId = new mongoose.Types.ObjectId();
    const fileId = 'file_kb_1';
    const file = await seedFile(fileId, userId);
    const agent = await seedAgent(userId, [fileId]);

    await processDeleteRequest({
      req: buildReq([file.toObject()], { id: userId.toString(), tenantId: 'tenant-a' }),
      files: [file.toObject()],
    });

    const [url, config] = deleteCall();
    expect(url).toBe('http://rag-api.test/documents');
    expect(config.params).toEqual({ entity_id: agent.id });
    expect(config.data).toEqual([fileId]);

    expect(generateShortLivedToken).toHaveBeenCalledWith({
      userId: userId.toString(),
      tenantId: 'tenant-a',
      entityIds: [agent.id],
      scopes: ['rag:embed'],
    });
  });

  test('leaves a user-owned file scoped to the user alone', async () => {
    const userId = new mongoose.Types.ObjectId();
    const fileId = 'file_attachment_1';
    const file = await seedFile(fileId, userId);

    await processDeleteRequest({
      req: buildReq([file.toObject()], { id: userId.toString() }),
      files: [file.toObject()],
    });

    const [, config] = deleteCall();
    expect(config.params).toBeUndefined();
    expect(generateShortLivedToken).toHaveBeenCalledWith({
      userId: userId.toString(),
      tenantId: undefined,
      entityIds: [],
      scopes: ['rag:embed'],
    });
  });

  test('scopes the secondary vector delete when the file lives in another store', async () => {
    const userId = new mongoose.Types.ObjectId();
    const fileId = 'file_kb_local';
    const file = await seedFile(fileId, userId, FileSources.local);
    const agent = await seedAgent(userId, [fileId]);

    await processDeleteRequest({
      req: buildReq([file.toObject()], { id: userId.toString() }),
      files: [file.toObject()],
    });

    expect(mockPrimaryDeleteFile).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entity_id: agent.id }),
      undefined,
    );
    const [, config] = deleteCall();
    expect(config.params).toEqual({ entity_id: agent.id });
  });

  test('resolves each file to its own agent in a mixed batch', async () => {
    const userId = new mongoose.Types.ObjectId();
    const kbFileId = 'file_kb_mixed';
    const ownFileId = 'file_own_mixed';
    const kbFile = await seedFile(kbFileId, userId);
    const ownFile = await seedFile(ownFileId, userId);
    const agent = await seedAgent(userId, [kbFileId]);

    await processDeleteRequest({
      req: buildReq([kbFile.toObject(), ownFile.toObject()], { id: userId.toString() }),
      files: [kbFile.toObject(), ownFile.toObject()],
    });

    const paramsByFileId = new Map(
      axios.delete.mock.calls.map(([, config]) => [config.data[0], config.params]),
    );
    expect(paramsByFileId.get(kbFileId)).toEqual({ entity_id: agent.id });
    expect(paramsByFileId.get(ownFileId)).toBeUndefined();
  });

  test('deletes the file record even when the entity lookup fails', async () => {
    const userId = new mongoose.Types.ObjectId();
    const fileId = 'file_lookup_failure';
    const file = await seedFile(fileId, userId);

    const db = require('~/models');
    const original = db.getAgentIdsByFileIds;
    db.getAgentIdsByFileIds = jest.fn().mockRejectedValue(new Error('lookup failed'));

    try {
      await processDeleteRequest({
        req: buildReq([file.toObject()], { id: userId.toString() }),
        files: [file.toObject()],
      });
      expect(await File.findOne({ file_id: fileId })).toBeNull();
    } finally {
      db.getAgentIdsByFileIds = original;
    }
  });
});
