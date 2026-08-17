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
const {
  agentSchema,
  fileSchema,
  createMethods,
  NO_EMBEDDING_ENTITY,
} = require('@librechat/data-schemas');

jest.mock('axios');

jest.mock('@librechat/data-schemas', () => {
  const actual = jest.requireActual('@librechat/data-schemas');
  return {
    ...actual,
    logger: { warn: jest.fn(), debug: jest.fn(), error: jest.fn(), info: jest.fn() },
  };
});

/* Everything except the token mint stays real: the entity resolution under
 * test is the whole point of this file, so only the signing key is stubbed. */
jest.mock('@librechat/api', () => ({
  ...jest.requireActual('@librechat/api'),
  generateShortLivedToken: jest.fn(() => 'mock-jwt-token'),
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

  /** Seeds a file record. Omitting `embedding_entity_id` produces a legacy
   * record — one written before uploads recorded where the chunks went. */
  const seedFile = async (file_id, userId, { source = FileSources.vectordb, ...rest } = {}) =>
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
      ...rest,
    });

  const seedAgent = async (authorId, file_ids, id) =>
    Agent.create({
      id: id ?? `agent_${Math.random().toString(36).slice(2, 10)}`,
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
    const agent = await seedAgent(userId, [fileId]);
    const file = await seedFile(fileId, userId, { embedding_entity_id: agent.id });

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
      scopes: ['rag:documents'],
    });
  });

  test('leaves a user-owned file scoped to the user alone', async () => {
    const userId = new mongoose.Types.ObjectId();
    const fileId = 'file_attachment_1';
    const file = await seedFile(fileId, userId, {
      embedding_entity_id: NO_EMBEDDING_ENTITY,
    });

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
      scopes: ['rag:documents'],
    });
  });

  test('scopes the secondary vector delete when the file lives in another store', async () => {
    const userId = new mongoose.Types.ObjectId();
    const fileId = 'file_kb_local';
    const agent = await seedAgent(userId, [fileId]);
    const file = await seedFile(fileId, userId, {
      source: FileSources.local,
      embedding_entity_id: agent.id,
    });

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
    const agent = await seedAgent(userId, [kbFileId]);
    const kbFile = await seedFile(kbFileId, userId, { embedding_entity_id: agent.id });
    const ownFile = await seedFile(ownFileId, userId, {
      embedding_entity_id: NO_EMBEDDING_ENTITY,
    });

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

  describe('a vector delete that never happened is never reported as done', () => {
    const runDelete = async (fileId) => {
      const userId = new mongoose.Types.ObjectId();
      const file = await seedFile(fileId, userId);
      const result = await processDeleteRequest({
        req: buildReq([file.toObject()], { id: userId.toString() }),
        files: [file.toObject()],
      });
      return { result, record: await File.findOne({ file_id: fileId }) };
    };

    test('keeps the file record when the RAG token cannot be minted', async () => {
      generateShortLivedToken.mockImplementation(() => {
        throw new Error('RAG_AUTH_ACCEPT_LEGACY=false requires RAG_JWT_SECRET');
      });

      const { result, record } = await runDelete('file_mint_failure');

      expect(axios.delete).not.toHaveBeenCalled();
      expect(result.deletedFileIds).not.toContain('file_mint_failure');
      expect(result.failedFileIds).toContain('file_mint_failure');
      expect(record).not.toBeNull();
    });

    test('keeps the file record when the RAG API rejects the delete', async () => {
      const error = new Error('Internal Server Error');
      error.response = { status: 500 };
      axios.delete.mockRejectedValue(error);

      const { result, record } = await runDelete('file_rag_rejected');

      expect(result.deletedFileIds).not.toContain('file_rag_rejected');
      expect(result.failedFileIds).toContain('file_rag_rejected');
      expect(record).not.toBeNull();
    });

    test('keeps the file record when the RAG API is unreachable', async () => {
      axios.delete.mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:8000'));

      const { result, record } = await runDelete('file_rag_unreachable');

      expect(result.deletedFileIds).not.toContain('file_rag_unreachable');
      expect(result.failedFileIds).toContain('file_rag_unreachable');
      expect(record).not.toBeNull();
    });

    test('removes the file record once the RAG API has forgotten the chunks', async () => {
      const error = new Error('Not Found');
      error.response = { status: 404 };
      axios.delete.mockRejectedValue(error);

      const { result, record } = await runDelete('file_rag_absent');

      expect(result.deletedFileIds).toContain('file_rag_absent');
      expect(result.failedFileIds).not.toContain('file_rag_absent');
      expect(record).toBeNull();
    });
  });

  /**
   * The entity comes from what the upload recorded, never from whichever agent
   * happens to list the file at delete time. Those two disagree routinely: an
   * agent can be given a file id it never embedded, and can drop one it did.
   */
  describe('the recorded entity outranks the current association', () => {
    const deleteAndReadEntity = async (file, userId) => {
      await processDeleteRequest({
        req: buildReq([file.toObject()], { id: userId.toString() }),
        files: [file.toObject()],
      });
      const [, config] = deleteCall();
      return {
        param: config.params?.entity_id,
        claimed: generateShortLivedToken.mock.calls[0][0].entityIds,
      };
    };

    test('a message attachment later referenced by an agent stays user-scoped', async () => {
      const userId = new mongoose.Types.ObjectId();
      const fileId = 'file_attachment_adopted';
      const file = await seedFile(fileId, userId, {
        embedding_entity_id: NO_EMBEDDING_ENTITY,
      });
      await seedAgent(userId, [fileId]);

      const { param, claimed } = await deleteAndReadEntity(file, userId);

      expect(param).toBeUndefined();
      expect(claimed).toEqual([]);
    });

    test('a file listed by several agents keeps the one that embedded it', async () => {
      const userId = new mongoose.Types.ObjectId();
      const fileId = 'file_kb_shared';
      const owner = await seedAgent(userId, [fileId], 'agent_zzz_owner');
      await seedAgent(userId, [fileId], 'agent_aaa_borrower');
      const file = await seedFile(fileId, userId, { embedding_entity_id: owner.id });

      const { param, claimed } = await deleteAndReadEntity(file, userId);

      expect(param).toBe(owner.id);
      expect(claimed).toEqual([owner.id]);
    });

    test('a file detached from its agent still names that agent', async () => {
      const userId = new mongoose.Types.ObjectId();
      const fileId = 'file_kb_detached';
      const agent = await seedAgent(userId, []);
      const file = await seedFile(fileId, userId, { embedding_entity_id: agent.id });

      const { param, claimed } = await deleteAndReadEntity(file, userId);

      expect(param).toBe(agent.id);
      expect(claimed).toEqual([agent.id]);
    });
  });

  /* Records written before uploads stamped the entity have nothing to read
   * back, so they alone still infer it from the agents that hold them. */
  describe('files predating the recorded entity', () => {
    test('infer the entity from the agent that holds them', async () => {
      const userId = new mongoose.Types.ObjectId();
      const fileId = 'file_legacy_held';
      const agent = await seedAgent(userId, [fileId]);
      const file = await seedFile(fileId, userId);

      await processDeleteRequest({
        req: buildReq([file.toObject()], { id: userId.toString() }),
        files: [file.toObject()],
      });

      expect(deleteCall()[1].params).toEqual({ entity_id: agent.id });
      expect(await File.findOne({ file_id: fileId })).toBeNull();
    });

    test('are deleted user-scoped when no agent holds them', async () => {
      const userId = new mongoose.Types.ObjectId();
      const fileId = 'file_legacy_unheld';
      const file = await seedFile(fileId, userId);

      await processDeleteRequest({
        req: buildReq([file.toObject()], { id: userId.toString() }),
        files: [file.toObject()],
      });

      expect(deleteCall()[1].params).toBeUndefined();
      expect(await File.findOne({ file_id: fileId })).toBeNull();
    });

    test('resolve to the same agent every time when several hold them', async () => {
      const userId = new mongoose.Types.ObjectId();
      const fileId = 'file_legacy_shared';
      await seedAgent(userId, [fileId], 'agent_zzz');
      await seedAgent(userId, [fileId], 'agent_aaa');
      const file = await seedFile(fileId, userId);

      await processDeleteRequest({
        req: buildReq([file.toObject()], { id: userId.toString() }),
        files: [file.toObject()],
      });

      expect(deleteCall()[1].params).toEqual({ entity_id: 'agent_aaa' });
    });
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
