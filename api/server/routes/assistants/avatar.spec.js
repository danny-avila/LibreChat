const os = require('os');
const fs = require('fs').promises;
const jwt = require('jsonwebtoken');
const multer = require('multer');
const express = require('express');
const mongoose = require('mongoose');
const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { createImageAuthorizationMiddleware } = require('@librechat/api');
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
const { updateAssistantDoc } = require('~/models');
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
  let privateAssistants;
  let requestUser;
  let User;
  const retrieve = jest.fn();
  const update = jest.fn();
  const openai = { beta: { assistants: { retrieve, update } } };

  beforeAll(async () => {
    directory = await fs.mkdtemp(`${os.tmpdir()}/assistant-avatar-`);
    mongo = await MongoMemoryServer.create({ instance: { args: ['--nounixsocket'] } });
    await mongoose.connect(mongo.getUri());
    mongoose.set('strictQuery', true);
    ({ Assistant, User } = createModels(mongoose));
    const upload = multer({ dest: directory });
    app = express();
    // Authenticated user/config fixture; exercise real multipart parsing, route, guard and DB.
    app.use((req, _res, next) => {
      req.user = { id: requestUser.toString(), role: 'USER', tenantId: 'tenant-a' };
      req.config = {
        fileStrategy: 'local',
        endpoints: { assistants: { privateAssistants } },
      };
      next();
    });
    app.post('/api/files/images/assistants/:assistant_id/avatar', upload.single('file'));
    app.use((req, _res, next) => {
      tenantStorage.run({ tenantId: req.user.tenantId }, next);
    });
    app.use('/api/files/images/assistants', avatar);
    app.get(
      '/images/:user/:filename',
      createImageAuthorizationMiddleware(
        { secureImageLinks: true },
        {
          parseCookies: (header) => Object.fromEntries([header.split('=')]),
          isOpenIdReuseEnabled: () => false,
          getBasePath: () => '',
          findSession: async () => ({ id: 'test-session' }),
          getUserById: async () => ({ role: 'USER', tenantId: 'tenant-a' }),
          getAgent: async () => null,
          getAssistant: require('~/models').getAssistant,
          getImageConfig: async () => ({
            secureImageLinks: true,
            assistantEndpoints: [
              { endpoint: 'assistants', privateAssistants },
              { endpoint: 'azureAssistants', privateAssistants: true },
            ],
          }),
          getUserPrincipals: async () => [],
          hasCapabilityForPrincipals: async () => false,
          hasPermission: async () => false,
        },
      ),
      (_req, res) => res.sendStatus(200),
    );
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongo?.stop();
    await fs.rm(directory, { recursive: true, force: true });
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    privateAssistants = true;
    requestUser = attacker;
    await User.deleteMany({});
    await User.collection.insertMany([
      { _id: attacker, tenantId: 'tenant-a' },
      { _id: victim, tenantId: 'tenant-a' },
    ]);
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

  async function upload(id, fields = {}, query = '') {
    let req = request(app)
      .post(`/api/files/images/assistants/${id}/avatar${query}`)
      .field('endpoint', 'assistants');
    for (const [key, value] of Object.entries(fields)) {
      req = req.field(key, value);
    }
    const response = await req.attach('file', png, {
      filename: 'avatar.png',
      contentType: 'image/png',
    });
    expect(await fs.readdir(directory)).toEqual([]);
    return response;
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
    expect(response.status).toBe(400);
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
    const filepath = `/images/${attacker}/managed-avatar.png`;
    uploadImageBuffer.mockResolvedValue({ filepath });
    const response = await upload('asst-victim');
    expect(response.status).toBe(201);
    const doc = await Assistant.findOne({ assistant_id: 'asst-victim' }).lean();
    expect(doc.user.toString()).toBe(victim.toString());
    expect(doc.avatar).toEqual({ filepath, source: 'local' });
    const token = jwt.sign({ id: victim.toString() }, process.env.JWT_REFRESH_SECRET, {
      expiresIn: '1h',
    });
    const image = await request(app).get(filepath).set('Cookie', `refreshToken=${token}`);
    expect(image.status).toBe(200);
    const unrelatedToken = jwt.sign(
      { id: new mongoose.Types.ObjectId().toString() },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: '1h' },
    );
    const denied = await request(app).get(filepath).set('Cookie', `refreshToken=${unrelatedToken}`);
    expect(denied.status).toBe(403);
  });

  it('creates a reference for a provider-only private assistant after verifying its author', async () => {
    providers['asst-provider-only'] = {
      id: 'asst-provider-only',
      metadata: { author: attacker.toString() },
    };
    const response = await upload('asst-provider-only');
    expect(response.status).toBe(201);
    const doc = await Assistant.findOne({ assistant_id: 'asst-provider-only' }).lean();
    expect(doc.user.toString()).toBe(attacker.toString());
    expect(doc).toMatchObject({
      endpoint: 'assistants',
      tenantId: 'tenant-a',
      avatar: { filepath: '/images/avatar.png', source: 'local' },
    });
  });

  it.each([false, true])(
    'preserves the provider author after a manager initializes an ownerless reference: %p',
    async (existingReference) => {
      if (existingReference) {
        await tenantStorage.run({ tenantId: 'tenant-a' }, async () =>
          updateAssistantDoc(
            { assistantId: 'asst-managed-provider' },
            { conversation_starters: ['Hello'] },
          ),
        );
      }
      providers['asst-managed-provider'] = {
        id: 'asst-managed-provider',
        metadata: { author: victim.toString() },
      };
      hasCapability.mockResolvedValue(true);
      const managedPath = `/images/${attacker}/provider-avatar.png`;
      uploadImageBuffer.mockResolvedValue({ filepath: managedPath });
      const managedResponse = await upload('asst-managed-provider');
      expect(managedResponse.status).toBe(201);
      const reference = await Assistant.findOne({ assistant_id: 'asst-managed-provider' }).lean();
      expect(reference.user.toString()).toBe(victim.toString());
      const token = jwt.sign({ id: victim.toString() }, process.env.JWT_REFRESH_SECRET, {
        expiresIn: '1h',
      });
      const image = await request(app).get(managedPath).set('Cookie', `refreshToken=${token}`);
      expect(image.status).toBe(200);

      requestUser = victim;
      hasCapability.mockResolvedValue(false);
      providers['asst-managed-provider'] = managedResponse.body;
      const ownerPath = `/images/${victim}/owner-avatar.png`;
      uploadImageBuffer.mockResolvedValue({ filepath: ownerPath });
      // Keep the fixture focused on persistence rather than the old-storage deletion service.
      delete providers['asst-managed-provider'].metadata.avatar;
      delete providers['asst-managed-provider'].metadata.avatar_source;
      const ownerResponse = await upload('asst-managed-provider');
      expect(ownerResponse.status).toBe(201);
      const updated = await Assistant.findOne({ assistant_id: 'asst-managed-provider' }).lean();
      expect(updated.user.toString()).toBe(victim.toString());
      expect(updated.avatar.filepath).toBe(ownerPath);
      expect(await Assistant.countDocuments({ assistant_id: 'asst-managed-provider' })).toBe(1);
    },
  );

  it('keeps the owner of an existing shared assistant when another user changes its avatar', async () => {
    privateAssistants = false;
    const response = await upload('asst-victim');
    expect(response.status).toBe(201);
    const doc = await Assistant.findOne({ assistant_id: 'asst-victim' }).lean();
    expect(doc.user.toString()).toBe(victim.toString());
    expect(doc.avatar).toEqual({ filepath: '/images/avatar.png', source: 'local' });
    expect(await Assistant.countDocuments({ assistant_id: 'asst-victim' })).toBe(1);
  });

  it('keeps provider-only shared avatars accessible to another authenticated user', async () => {
    privateAssistants = false;
    providers['asst-provider-only'] = { id: 'asst-provider-only', metadata: {} };
    const filepath = `/images/${attacker}/shared-avatar.png`;
    uploadImageBuffer.mockResolvedValue({ filepath });

    const response = await upload('asst-provider-only');
    expect(response.status).toBe(201);
    const token = jwt.sign({ id: victim.toString() }, process.env.JWT_REFRESH_SECRET, {
      expiresIn: '1h',
    });
    const image = await request(app).get(filepath).set('Cookie', `refreshToken=${token}`);
    expect(image.status).toBe(200);
    const doc = await Assistant.findOne({ assistant_id: 'asst-provider-only' }).lean();
    expect(doc).toMatchObject({
      endpoint: 'assistants',
      avatar: { filepath, source: 'local' },
      tenantId: 'tenant-a',
    });
    expect(doc.user.toString()).toBe(attacker.toString());
  });

  it('backfills an action-created reference so a shared avatar remains accessible', async () => {
    privateAssistants = false;
    await tenantStorage.run({ tenantId: 'tenant-a' }, async () =>
      updateAssistantDoc(
        { assistantId: 'asst-action-created' },
        { user: victim, actions: ['example-action'] },
      ),
    );
    providers['asst-action-created'] = { id: 'asst-action-created', metadata: {} };
    const filepath = `/images/${attacker}/action-avatar.png`;
    uploadImageBuffer.mockResolvedValue({ filepath });

    const response = await upload('asst-action-created');
    expect(response.status).toBe(201);
    const token = jwt.sign({ id: victim.toString() }, process.env.JWT_REFRESH_SECRET, {
      expiresIn: '1h',
    });
    const image = await request(app).get(filepath).set('Cookie', `refreshToken=${token}`);
    expect(image.status).toBe(200);
    const doc = await Assistant.findOne({ assistant_id: 'asst-action-created' }).lean();
    expect(doc.user.toString()).toBe(victim.toString());
    expect(doc).toMatchObject({ endpoint: 'assistants', actions: ['example-action'] });
  });

  it('initializes an ownerless reference only after the provider author check succeeds', async () => {
    await tenantStorage.run({ tenantId: 'tenant-a' }, async () =>
      updateAssistantDoc(
        { assistantId: 'asst-ownerless' },
        { conversation_starters: ['Hello'], append_current_datetime: true },
      ),
    );
    providers['asst-ownerless'] = {
      id: 'asst-ownerless',
      metadata: { author: attacker.toString() },
    };

    const response = await upload('asst-ownerless');
    expect(response.status).toBe(201);
    expect(retrieve).toHaveBeenCalledWith('asst-ownerless');
    const doc = await Assistant.findOne({ assistant_id: 'asst-ownerless' }).lean();
    expect(doc.user.toString()).toBe(attacker.toString());
    expect(doc).toMatchObject({
      endpoint: 'assistants',
      conversation_starters: ['Hello'],
      append_current_datetime: true,
      avatar: { filepath: '/images/avatar.png', source: 'local' },
    });
    expect(await Assistant.countDocuments({ assistant_id: 'asst-ownerless' })).toBe(1);
  });

  it('does not claim an ownerless reference when the provider author differs', async () => {
    await tenantStorage.run({ tenantId: 'tenant-a' }, async () =>
      updateAssistantDoc({ assistantId: 'asst-ownerless' }, { conversation_starters: ['Hello'] }),
    );
    providers['asst-ownerless'] = {
      id: 'asst-ownerless',
      metadata: { author: victim.toString() },
    };
    const response = await upload('asst-ownerless');
    expect(response.status).not.toBe(201);
    const doc = await Assistant.findOne({ assistant_id: 'asst-ownerless' }).lean();
    expect(doc.user).toBeUndefined();
    expect(doc.avatar).toBeUndefined();
    expect(update).not.toHaveBeenCalled();
    expect(uploadImageBuffer).not.toHaveBeenCalled();
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
});
