const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const { createMethods } = require('@librechat/data-schemas');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { SystemRoles } = require('librechat-data-provider');
const { createFile } = require('~/models');

jest.mock('@librechat/api', () => ({
  ...jest.requireActual('@librechat/api'),
  refreshS3FileUrls: jest.fn(),
}));

jest.mock('~/config', () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

const router = require('./files');

async function createFileHelper(userId, userFileId) {
  return createFile({
    user: userId,
    file_id: userFileId,
    filename: 'original.txt',
    filepath: '/uploads/original.txt',
    bytes: 100,
    type: 'text/plain',
  });
}

// Note: tests designed to be placed in mainline files.test.js, if we ever decide to upstream this
describe('PATCH /files/:file_id', () => {
  let app;
  let mongoServer;
  let authorId;
  let userId;
  let fileId;
  let File;
  let User;
  let methods;
  let modelsToCleanup = [];

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    const { createModels } = require('@librechat/data-schemas');
    const models = createModels(mongoose);
    modelsToCleanup = Object.keys(models);
    Object.assign(mongoose.models, models);
    methods = createMethods(mongoose);

    File = models.File;
    User = models.User;

    await methods.seedDefaultRoles();

    app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      req.user = { id: userId?.toString() || 'default-user', role: SystemRoles.USER };
      next();
    });
    app.use('/files', router);
  });

  afterAll(async () => {
    const collections = mongoose.connection.collections;
    for (const key in collections) {
      await collections[key].deleteMany({});
    }
    for (const modelName of modelsToCleanup) {
      delete mongoose.models[modelName];
    }
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    await File.deleteMany({});
    await User.deleteMany({});

    authorId = new mongoose.Types.ObjectId();
    userId = new mongoose.Types.ObjectId();
    fileId = uuidv4();

    await User.create({ _id: authorId, username: 'author', email: 'author@test.com' });
    await User.create({ _id: userId, username: 'user', email: 'user@test.com' });

    await createFileHelper(authorId, fileId);
  });

  it('should pin a file owned by the user', async () => {
    const userFileId = uuidv4();
    await createFileHelper(userId, userFileId);

    const response = await request(app).patch(`/files/${userFileId}`).send({ pinned: true });

    expect(response.status).toBe(200);
    expect(response.body.pinned).toBe(true);
    expect(response.body.file_id).toBe(userFileId);
  });

  it('should rename a file owned by the user', async () => {
    const userFileId = uuidv4();
    await createFileHelper(userId, userFileId);

    const response = await request(app)
      .patch(`/files/${userFileId}`)
      .send({ filename: 'renamed.txt' });

    expect(response.status).toBe(200);
    expect(response.body.filename).toBe('renamed.txt');
  });

  it('should update both pinned and filename in one request', async () => {
    const userFileId = uuidv4();
    await createFileHelper(userId, userFileId);

    const response = await request(app)
      .patch(`/files/${userFileId}`)
      .send({ pinned: true, filename: 'renamed.txt' });

    expect(response.status).toBe(200);
    expect(response.body.pinned).toBe(true);
    expect(response.body.filename).toBe('renamed.txt');
  });

  it('should return 404 for a file not owned by the user', async () => {
    const response = await request(app).patch(`/files/${fileId}`).send({ pinned: true });

    expect(response.status).toBe(404);
    expect(response.body.message).toBe('File not found');
  });

  it('should return 404 for a non-existent file', async () => {
    const response = await request(app).patch(`/files/${uuidv4()}`).send({ pinned: true });

    expect(response.status).toBe(404);
    expect(response.body.message).toBe('File not found');
  });

  it('should return 400 when no updatable fields are provided', async () => {
    const userFileId = uuidv4();
    await createFileHelper(userId, userFileId);

    const response = await request(app).patch(`/files/${userFileId}`).send({});

    expect(response.status).toBe(400);
  });

  it('should return 400 when pinned is not a boolean', async () => {
    const userFileId = uuidv4();
    await createFileHelper(userId, userFileId);

    const response = await request(app).patch(`/files/${userFileId}`).send({ pinned: 'yes' });

    expect(response.status).toBe(400);
  });

  it('should return 400 when filename is an empty string', async () => {
    const userFileId = uuidv4();
    await createFileHelper(userId, userFileId);

    const response = await request(app).patch(`/files/${userFileId}`).send({ filename: '' });

    expect(response.status).toBe(400);
  });
});
