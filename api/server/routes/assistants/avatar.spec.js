const os = require('os');
const fs = require('fs').promises;
const multer = require('multer');
const express = require('express');
const mongoose = require('mongoose');
const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { createModels, tenantStorage } = require('@librechat/data-schemas');

jest.mock('~/models', () => require('@librechat/data-schemas').createMethods(require('mongoose')));
jest.mock('~/server/middleware/roles/capabilities', () => ({ hasCapability: jest.fn() }));
jest.mock('~/server/services/Files/process', () => ({
  filterFile: jest.fn(),
  uploadImageBuffer: jest.fn(),
}));
jest.mock('~/server/services/Files/strategies', () => ({ getStrategyFunctions: jest.fn() }));
jest.mock('~/server/services/ActionService', () => ({ deleteAssistantActions: jest.fn() }));
jest.mock('~/server/services/MCP', () => ({}));
jest.mock('~/app/clients/tools', () => ({ manifestToolMap: {} }));
jest.mock('~/server/controllers/assistants/helpers', () => ({
  getOpenAIClient: jest.fn(),
  fetchAssistants: jest.fn(),
}));
jest.mock('./actions', () => require('express').Router());
jest.mock('./documents', () => require('express').Router());
jest.mock('./tools', () => require('express').Router());

const { hasCapability } = require('~/server/middleware/roles/capabilities');
const { uploadImageBuffer } = require('~/server/services/Files/process');
const { getOpenAIClient } = require('~/server/controllers/assistants/helpers');
const { avatar } = require('./v1');

const attacker = new mongoose.Types.ObjectId();
const victim = new mongoose.Types.ObjectId();
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
  'base64',
);

describe('assistant avatar multipart authorization', () => {
  let mongo;
  let directory;
  let Assistant;
  let app;
  let providers;
  const retrieve = jest.fn();
  const update = jest.fn();
  const openai = { beta: { assistants: { retrieve, update } } };

  beforeAll(async () => {
    directory = await fs.mkdtemp(`${os.tmpdir()}/assistant-avatar-`);
    mongo = await MongoMemoryServer.create({ instance: { args: ['--nounixsocket'] } });
    await mongoose.connect(mongo.getUri());
    mongoose.set('strictQuery', true);
    Assistant = createModels(mongoose).Assistant;
    const upload = multer({ dest: directory });
    app = express();
    // Authenticated user/config fixture; exercise real multipart parsing, route, guard and DB.
    app.use((req, _res, next) => {
      req.user = { id: attacker.toString(), role: 'USER', tenantId: 'tenant-a' };
      req.config = {
        fileStrategy: 'local',
        endpoints: { assistants: { privateAssistants: true } },
      };
      next();
    });
    app.post('/api/files/images/assistants/:assistant_id/avatar', upload.single('file'));
    app.use((req, _res, next) => {
      tenantStorage.run({ tenantId: req.user.tenantId }, next);
    });
    app.use('/api/files/images/assistants', avatar);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongo?.stop();
    await fs.rm(directory, { recursive: true, force: true });
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    await Assistant.deleteMany({});
    await Assistant.create([
      {
        assistant_id: 'asst-attacker',
        user: attacker,
        endpoint: 'assistants',
        tenantId: 'tenant-a',
      },
      { assistant_id: 'asst-victim', user: victim, endpoint: 'assistants', tenantId: 'tenant-a' },
      {
        assistant_id: 'asst-other-tenant',
        user: attacker,
        endpoint: 'assistants',
        tenantId: 'tenant-b',
      },
    ]);
    providers = {
      'asst-attacker': { id: 'asst-attacker', metadata: { author: attacker.toString() } },
      'asst-victim': {
        id: 'asst-victim',
        instructions: 'private victim configuration',
        metadata: { author: victim.toString() },
      },
      'asst-other-tenant': {
        id: 'asst-other-tenant',
        metadata: { author: victim.toString() },
      },
    };
    retrieve.mockImplementation(async (id) => providers[id]);
    update.mockImplementation(async (id, data) => ({ ...providers[id], ...data }));
    hasCapability.mockResolvedValue(false);
    getOpenAIClient.mockResolvedValue({ openai });
    uploadImageBuffer.mockResolvedValue({ filepath: '/images/avatar.png' });
  });

  function upload(id, fields = {}, query = '') {
    let req = request(app)
      .post(`/api/files/images/assistants/${id}/avatar${query}`)
      .field('endpoint', 'assistants');
    for (const [key, value] of Object.entries(fields)) {
      req = req.field(key, value);
    }
    return req.attach('file', png, { filename: 'avatar.png', contentType: 'image/png' });
  }

  async function expectVictimUnchanged() {
    const doc = await Assistant.findOne({ assistant_id: 'asst-victim' }).lean();
    expect(doc.user.toString()).toBe(victim.toString());
    expect(doc.avatar).toBeUndefined();
    expect(update).not.toHaveBeenCalled();
    expect(uploadImageBuffer).not.toHaveBeenCalled();
  }

  it('denies the victim route with omitted body and query IDs despite an unrelated owned assistant', async () => {
    const response = await upload('asst-victim');
    expect(response.status).not.toBe(201);
    expect(response.body).not.toHaveProperty('instructions');
    expect(retrieve).toHaveBeenCalledWith('asst-victim');
    expect(retrieve).not.toHaveBeenCalledWith(undefined);
    await expectVictimUnchanged();
  });

  it.each([
    [{ assistant_id: 'asst-attacker' }, ''],
    [{}, '?assistant_id=asst-attacker'],
    [{ assistant_id: 'asst-victim' }, '?assistant_id=asst-attacker'],
    [{}, '?assistant_id=asst-victim&assistant_id=asst-attacker'],
  ])('rejects conflicting or malformed secondary selectors: %p %s', async (fields, query) => {
    const response = await upload('asst-victim', fields, query);
    expect(response.status).not.toBe(201);
    expect(retrieve).not.toHaveBeenCalled();
    await expectVictimUnchanged();
  });

  it('allows an owner upload without redundant selectors and preserves ownership', async () => {
    const response = await upload('asst-attacker');
    expect(response.status).toBe(201);
    const doc = await Assistant.findOne({ assistant_id: 'asst-attacker' }).lean();
    expect(doc.user.toString()).toBe(attacker.toString());
    expect(doc.endpoint).toBe('assistants');
    expect(doc.avatar).toEqual({ filepath: '/images/avatar.png', source: 'local' });
    expect(update).toHaveBeenCalledWith('asst-attacker', {
      metadata: {
        author: attacker.toString(),
        avatar: '/images/avatar.png',
        avatar_source: 'local',
      },
    });
  });

  it('accepts matching multipart and query IDs', async () => {
    const response = await upload(
      'asst-attacker',
      { assistant_id: 'asst-attacker' },
      '?assistant_id=asst-attacker',
    );
    expect(response.status).toBe(201);
  });

  it('allows management without transferring the victim document ownership', async () => {
    hasCapability.mockResolvedValue(true);
    const response = await upload('asst-victim');
    expect(response.status).toBe(201);
    const doc = await Assistant.findOne({ assistant_id: 'asst-victim' }).lean();
    expect(doc.user.toString()).toBe(victim.toString());
    expect(doc.avatar).toEqual({ filepath: '/images/avatar.png', source: 'local' });
  });

  it('does not authorize using an owned assistant in another tenant', async () => {
    const response = await upload('asst-other-tenant');
    expect(response.status).not.toBe(201);
    expect(update).not.toHaveBeenCalled();
    expect(uploadImageBuffer).not.toHaveBeenCalled();
    const doc = await Assistant.findOne({ assistant_id: 'asst-other-tenant' }).lean();
    expect(doc.avatar).toBeUndefined();
  });

  it('does not upload or mutate when the selected provider cannot access the victim', async () => {
    retrieve.mockRejectedValue(new Error('provider scope denied'));
    const response = await upload('asst-victim');
    expect(response.status).not.toBe(201);
    await expectVictimUnchanged();
  });

  afterEach(async () => {
    expect(await fs.readdir(directory)).toEqual([]);
  });
});
