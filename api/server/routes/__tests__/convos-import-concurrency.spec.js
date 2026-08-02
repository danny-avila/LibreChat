const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { buildChatGptExportZip, cleanupChatGptExportZips } = require('~/test/chatgptExport');
const { createModels, createMethods } = require('@librechat/data-schemas');
const { FileSources } = require('librechat-data-provider');

/** One stage at a time, so a single running import puts the node at capacity
 * and the next request has to be refused rather than admitted. */
process.env.CONVERSATION_IMPORT_MAX_CONCURRENT = '1';

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
jest.mock('~/server/services/Files/strategies', () => ({
  getStrategyFunctions: jest.fn(() => ({ saveBuffer: jest.fn() })),
}));

/** Holds the run open. Everything else in the package stays real: the point
 * is to observe the ceiling while a genuine run occupies its slot, and a run
 * over these fixtures finishes far too quickly to observe otherwise. */
const mockRun = { release: null };
jest.mock('@librechat/api', () => {
  const actual = jest.requireActual('@librechat/api');
  return {
    ...actual,
    runImport: jest.fn(
      () =>
        new Promise((resolve) => {
          mockRun.release = () => resolve({ imported: 0, skipped: 0, failed: 0, errors: [] });
        }),
    ),
  };
});

/** Waits for the mocked run to be entered, i.e. for the job to hold the slot. */
async function waitForRunStart() {
  for (let i = 0; i < 40; i++) {
    if (mockRun.release) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('The import run never started');
}

describe('import concurrency ceiling', () => {
  let app;
  let mongoServer;
  let userId;
  const uploadDirs = [];

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    const models = createModels(mongoose);
    Object.assign(mongoose.models, models);
    await createMethods(mongoose).seedDefaultRoles();

    const convosRouter = require('../convos');

    app = express();
    app.use((req, res, next) => {
      req.user = { id: userId, role: 'USER' };
      const uploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lc-import-cap-uploads-'));
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
    cleanupChatGptExportZips();
    delete process.env.CONVERSATION_IMPORT_MAX_CONCURRENT;
  });

  beforeEach(() => {
    userId = new mongoose.Types.ObjectId().toString();
    mockRun.release = null;
  });

  /** The per-user limit lets a second account through; the node-wide ceiling
   * is what keeps two exports from being parsed in one heap at once. */
  it("refuses a second user's upload while the node is at capacity, and admits it once the run ends", async () => {
    const filepath = await buildChatGptExportZip();

    const uploaded = await request(app)
      .post('/api/convos/import')
      .attach('file', filepath)
      .expect(202);
    await request(app).post(`/api/convos/import/jobs/${uploaded.body.jobId}/start`).expect(202);
    await waitForRunStart();

    const owner = userId;
    userId = new mongoose.Types.ObjectId().toString();
    const refused = await request(app)
      .post('/api/convos/import')
      .attach('file', filepath)
      .expect(429);
    expect(refused.body.message).toBe('Too many imports are running, try again shortly');

    userId = owner;
    mockRun.release();

    for (let i = 0; i < 40; i++) {
      const status = await request(app).get(`/api/convos/import/jobs/${uploaded.body.jobId}`);
      if (status.body.phase === 'completed') {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }

    await request(app).post('/api/convos/import').attach('file', filepath).expect(202);
  });
});
