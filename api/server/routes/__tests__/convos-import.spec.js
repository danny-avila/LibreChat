const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');
const multer = require('multer');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { buildFixtureExport } = require('@librechat/api');
const { createModels, createMethods } = require('@librechat/data-schemas');
const { FileSources } = require('librechat-data-provider');

jest.mock('~/server/middleware/requireJwtAuth', () => (req, res, next) => next());
jest.mock('~/server/middleware', () => ({
  createImportLimiters: () => ({
    importIpLimiter: (req, res, next) => next(),
    importUserLimiter: (req, res, next) => next(),
  }),
  createForkLimiters: () => ({
    forkIpLimiter: (req, res, next) => next(),
    forkUserLimiter: (req, res, next) => next(),
  }),
  configMiddleware: (req, res, next) => next(),
  validateConvoAccess: (req, res, next) => next(),
}));
jest.mock('~/server/utils/import/defaults', () => ({
  resolveImportDefaultModel: jest.fn().mockResolvedValue('gpt-4o-mini'),
}));
/**
 * The real local storage strategy writes under the repo's `client/public`
 * tree. This route test only cares that the job pipeline calls `saveBuffer`
 * and persists the resulting filepath, so it substitutes a strategy that
 * writes assets into a throwaway temp directory instead of the real repo.
 */
jest.mock('~/server/services/Files/strategies', () => ({
  getStrategyFunctions: jest.fn(() => ({
    saveBuffer: async ({ buffer, fileName }) => {
      const nodeFs = require('fs');
      const nodePath = require('path');
      const nodeOs = require('os');
      const dir = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), 'lc-import-assets-'));
      const filepath = nodePath.join(dir, fileName);
      nodeFs.writeFileSync(filepath, buffer);
      return filepath;
    },
  })),
}));

const importFileFilter = (req, file, cb) => {
  if (file.mimetype === 'application/json') {
    cb(null, true);
  } else {
    cb(new Error('Only JSON files are allowed'), false);
  }
};

/** Proxy app that mirrors the production multer + error-handling pattern */
function createImportApp(fileSize) {
  const app = express();
  const upload = multer({
    storage: multer.memoryStorage(),
    fileFilter: importFileFilter,
    limits: { fileSize },
  });
  const uploadSingle = upload.single('file');

  function handleUpload(req, res, next) {
    uploadSingle(req, res, (err) => {
      if (err && err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ message: 'File exceeds the maximum allowed size' });
      }
      if (err) {
        return next(err);
      }
      next();
    });
  }

  app.post('/import', handleUpload, (req, res) => {
    res.status(201).json({ message: 'success', size: req.file.size });
  });

  app.use((err, _req, res, _next) => {
    res.status(400).json({ error: err.message });
  });

  return app;
}

describe('Conversation Import - Multer File Size Limits', () => {
  describe('multer rejects files exceeding the configured limit', () => {
    it('returns 413 for files larger than the limit', async () => {
      const limit = 1024;
      const app = createImportApp(limit);
      const oversized = Buffer.alloc(limit + 512, 'x');

      const res = await request(app)
        .post('/import')
        .attach('file', oversized, { filename: 'import.json', contentType: 'application/json' });

      expect(res.status).toBe(413);
      expect(res.body.message).toBe('File exceeds the maximum allowed size');
    });

    it('accepts files within the limit', async () => {
      const limit = 4096;
      const app = createImportApp(limit);
      const valid = Buffer.from(JSON.stringify({ title: 'test' }));

      const res = await request(app)
        .post('/import')
        .attach('file', valid, { filename: 'import.json', contentType: 'application/json' });

      expect(res.status).toBe(201);
      expect(res.body.message).toBe('success');
    });

    it('rejects at the exact boundary (limit + 1 byte)', async () => {
      const limit = 512;
      const app = createImportApp(limit);
      const boundary = Buffer.alloc(limit + 1, 'a');

      const res = await request(app)
        .post('/import')
        .attach('file', boundary, { filename: 'import.json', contentType: 'application/json' });

      expect(res.status).toBe(413);
    });

    it('accepts a file just under the limit', async () => {
      const limit = 512;
      const app = createImportApp(limit);
      const underLimit = Buffer.alloc(limit - 1, 'b');

      const res = await request(app)
        .post('/import')
        .attach('file', underLimit, { filename: 'import.json', contentType: 'application/json' });

      expect(res.status).toBe(201);
    });
  });
});

/** Waits for a job to leave the given phase, polling the real job store through the route. */
async function waitForPhase(app, jobId, notPhase, attempts = 20) {
  for (let i = 0; i < attempts; i++) {
    const res = await request(app).get(`/api/convos/import/jobs/${jobId}`);
    if (res.body.phase !== notPhase) {
      return res;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Job ${jobId} never left phase ${notPhase}`);
}

function bareChatGptExport() {
  return Buffer.from(
    JSON.stringify([
      {
        conversation_id: 'ext-bare',
        title: 'Bare export',
        create_time: 1700000000,
        update_time: 1700000100,
        default_model_slug: 'gpt-4o',
        is_archived: false,
        is_starred: false,
        pinned_time: null,
        mapping: {
          root: { id: 'root', message: null, parent: null, children: ['u1'] },
          u1: {
            id: 'u1',
            parent: 'root',
            children: [],
            message: {
              id: 'u1',
              author: { role: 'user', name: null },
              create_time: 1700000001,
              content: { content_type: 'text', parts: ['Hello'] },
            },
          },
        },
      },
    ]),
  );
}

function claudeExport() {
  return Buffer.from(
    JSON.stringify([
      {
        uuid: 'claude-1',
        name: 'Claude convo',
        created_at: '2024-01-01T00:00:00Z',
        chat_messages: [
          { sender: 'human', text: 'Hi there', created_at: '2024-01-01T00:00:00Z' },
          { sender: 'assistant', text: 'Hello!', created_at: '2024-01-01T00:00:01Z' },
        ],
      },
    ]),
  );
}

function chatbotUiExport() {
  return Buffer.from(
    JSON.stringify({
      version: 1,
      history: [
        {
          model: { id: 'gpt-4o-mini' },
          name: 'Chatbot UI convo',
          messages: [
            { role: 'user', content: 'Hi' },
            { role: 'assistant', content: 'Hello!' },
          ],
        },
      ],
    }),
  );
}

describe('conversation import job API (real router, real Mongo)', () => {
  let app;
  let mongoServer;
  let Conversation;
  let User;
  let userId;
  const uploadDirs = [];

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    const models = createModels(mongoose);
    Object.assign(mongoose.models, models);
    Conversation = models.Conversation;
    User = models.User;

    const methods = createMethods(mongoose);
    await methods.seedDefaultRoles();

    const convosRouter = require('../convos');

    app = express();
    app.use((req, res, next) => {
      req.user = { id: userId, role: 'USER' };
      const uploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lc-import-uploads-'));
      uploadDirs.push(uploadsDir);
      req.config = {
        paths: { uploads: uploadsDir },
        fileStrategy: FileSources.local,
        interfaceConfig: {},
      };
      next();
    });
    app.use('/api/convos', convosRouter);
  });

  afterAll(async () => {
    const collections = mongoose.connection.collections;
    for (const key in collections) {
      await collections[key].deleteMany({});
    }
    await mongoose.disconnect();
    await mongoServer.stop();
    for (const dir of uploadDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  beforeEach(async () => {
    await Conversation.deleteMany({});
    await User.deleteMany({});
    userId = new mongoose.Types.ObjectId().toString();
    await User.create({ _id: userId, username: 'importer', email: 'importer@test.com' });
  });

  it('accepts a zip, returns a job awaiting confirmation, then runs it', async () => {
    const filepath = await buildFixtureExport();

    const uploaded = await request(app)
      .post('/api/convos/import')
      .attach('file', filepath)
      .expect(202);

    expect(uploaded.body.jobId).toBeDefined();
    expect(uploaded.body.summary.conversations).toBe(2);
    expect(uploaded.body.summary.assets).toBe(3);

    await request(app).post(`/api/convos/import/jobs/${uploaded.body.jobId}/start`).expect(202);

    const status = await request(app)
      .get(`/api/convos/import/jobs/${uploaded.body.jobId}`)
      .expect(200);

    expect(['conversations', 'assets', 'completed']).toContain(status.body.phase);
    expect(status.body.filepath).toBeUndefined();
    expect(status.body.userId).toBeUndefined();

    const completed = await waitForPhase(app, uploaded.body.jobId, 'conversations');
    expect(completed.body.phase).toBe('completed');
    expect(completed.body.report.imported).toBe(2);

    const savedConvos = await Conversation.countDocuments({ user: userId });
    expect(savedConvos).toBe(2);
  });

  it('rejects a file that is neither json nor zip', async () => {
    await request(app)
      .post('/api/convos/import')
      .attach('file', Buffer.from('nope'), 'notes.txt')
      .expect(400);
  });

  it('404s a job belonging to another user', async () => {
    await request(app).get('/api/convos/import/jobs/does-not-exist').expect(404);
  });

  it("scopes jobs by user: another user gets 404, not the first user's job", async () => {
    const filepath = await buildFixtureExport();
    const uploaded = await request(app)
      .post('/api/convos/import')
      .attach('file', filepath)
      .expect(202);

    userId = new mongoose.Types.ObjectId().toString();
    await request(app).get(`/api/convos/import/jobs/${uploaded.body.jobId}`).expect(404);
  });

  it('imports a bare ChatGPT .json upload through the job API, matching the zip pipeline', async () => {
    const uploaded = await request(app)
      .post('/api/convos/import')
      .attach('file', bareChatGptExport(), 'bare-export.json')
      .expect(202);

    expect(uploaded.body.jobId).toBeDefined();
    expect(uploaded.body.summary.conversations).toBe(1);
    expect(uploaded.body.summary.source).toBe('chatgpt-legacy');

    await request(app).post(`/api/convos/import/jobs/${uploaded.body.jobId}/start`).expect(202);
    const completed = await waitForPhase(app, uploaded.body.jobId, 'conversations');
    expect(completed.body.phase).toBe('completed');
    expect(completed.body.report.imported).toBe(1);

    const savedConvos = await Conversation.countDocuments({ user: userId });
    expect(savedConvos).toBe(1);
  });

  it('still imports a Claude-shaped .json upload through the legacy synchronous path', async () => {
    const res = await request(app)
      .post('/api/convos/import')
      .attach('file', claudeExport(), 'claude-export.json')
      .expect(201);

    expect(res.body.message).toBe('Conversation(s) imported successfully');
    const savedConvos = await Conversation.countDocuments({ user: userId });
    expect(savedConvos).toBe(1);
  });

  it('still imports a ChatbotUI-shaped .json upload through the legacy synchronous path', async () => {
    const res = await request(app)
      .post('/api/convos/import')
      .attach('file', chatbotUiExport(), 'chatbotui-export.json')
      .expect(201);

    expect(res.body.message).toBe('Conversation(s) imported successfully');
    const savedConvos = await Conversation.countDocuments({ user: userId });
    expect(savedConvos).toBe(1);
  });

  it('returns a sanitized message, not the raw archive error, when a zip fails to open', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lc-import-corrupt-'));
    const corrupt = path.join(dir, 'corrupt.zip');
    fs.writeFileSync(
      corrupt,
      Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('not a real zip body')]),
    );

    const res = await request(app).post('/api/convos/import').attach('file', corrupt).expect(400);

    expect(typeof res.body.message).toBe('string');
    expect(res.body.message).not.toContain(dir);
    expect(res.body.message).not.toContain(corrupt);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('never leaks the server upload path in job.error when the underlying file disappears before start', async () => {
    const beforeUpload = uploadDirs.length;
    const filepath = await buildFixtureExport();

    const uploaded = await request(app)
      .post('/api/convos/import')
      .attach('file', filepath)
      .expect(202);

    const requestUploadDir = uploadDirs[beforeUpload];
    const storedFilepath = path.join(requestUploadDir, 'temp', userId, 'chatgpt-export.zip');
    expect(fs.existsSync(storedFilepath)).toBe(true);
    fs.rmSync(storedFilepath);

    await request(app).post(`/api/convos/import/jobs/${uploaded.body.jobId}/start`).expect(202);

    const failed = await waitForPhase(app, uploaded.body.jobId, 'conversations');
    expect(failed.body.phase).toBe('failed');
    expect(typeof failed.body.error).toBe('string');
    expect(failed.body.error).not.toContain(requestUploadDir);
    expect(failed.body.error).not.toContain(storedFilepath);
    expect(JSON.stringify(failed.body)).not.toContain(requestUploadDir);
  });

  it('marks the job failed and removes the temp file when job setup throws synchronously', async () => {
    const { getStrategyFunctions } = require('~/server/services/Files/strategies');
    getStrategyFunctions.mockImplementationOnce(() => {
      throw new Error('Invalid file source: boom');
    });

    const beforeUpload = uploadDirs.length;
    const filepath = await buildFixtureExport();
    const uploaded = await request(app)
      .post('/api/convos/import')
      .attach('file', filepath)
      .expect(202);

    const requestUploadDir = uploadDirs[beforeUpload];
    const storedFilepath = path.join(requestUploadDir, 'temp', userId, 'chatgpt-export.zip');
    expect(fs.existsSync(storedFilepath)).toBe(true);

    await request(app).post(`/api/convos/import/jobs/${uploaded.body.jobId}/start`).expect(202);

    const failed = await waitForPhase(app, uploaded.body.jobId, 'conversations');
    expect(failed.body.phase).toBe('failed');
    expect(typeof failed.body.error).toBe('string');
    expect(fs.existsSync(storedFilepath)).toBe(false);
  });

  it('rejects a second /start call for the same job with 409 and does not double-run the import', async () => {
    const filepath = await buildFixtureExport();
    const uploaded = await request(app)
      .post('/api/convos/import')
      .attach('file', filepath)
      .expect(202);

    const [first, second] = await Promise.all([
      request(app).post(`/api/convos/import/jobs/${uploaded.body.jobId}/start`),
      request(app).post(`/api/convos/import/jobs/${uploaded.body.jobId}/start`),
    ]);

    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([202, 409]);

    await waitForPhase(app, uploaded.body.jobId, 'conversations');
    const savedConvos = await Conversation.countDocuments({ user: userId });
    expect(savedConvos).toBe(2);
  });
});
