const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

jest.mock('~/models', () => {
  const mongoose = require('mongoose');
  const { createMethods } = require('@librechat/data-schemas');
  const methods = createMethods(mongoose);
  return {
    ...methods,
    getRoleByName: jest.fn().mockResolvedValue({
      permissions: { BOOKMARKS: { USE: true } },
    }),
  };
});

jest.mock('~/server/middleware', () => ({
  requireJwtAuth: (req, _res, next) => {
    req.user = { id: req.testUserId, role: 'USER' };
    next();
  },
}));

let app;
let mongoServer;
let Conversation;
let testUserId;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());

  const dbModels = require('~/db/models');
  Conversation = dbModels.Conversation;

  testUserId = new mongoose.Types.ObjectId().toString();

  app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.testUserId = testUserId;
    next();
  });

  const tagRoutes = require('./tags');
  app.use('/api/tags', tagRoutes);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

afterEach(async () => {
  await mongoose.models.ConversationTag.deleteMany({});
  await Conversation.deleteMany({});
});

describe('Tag routes - tag names containing a literal "%"', () => {
  it('creates, fetches, and deletes a tag named "100%" without a 500', async () => {
    const createRes = await request(app).post('/api/tags').send({ tag: '100%' }).expect(200);
    expect(createRes.body.tag).toBe('100%');

    const listRes = await request(app).get('/api/tags').expect(200);
    expect(listRes.body.map((t) => t.tag)).toContain('100%');

    const deleteRes = await request(app)
      .delete(`/api/tags/${encodeURIComponent('100%')}`)
      .expect(200);
    expect(deleteRes.body.tag).toBe('100%');

    const listAfterDelete = await request(app).get('/api/tags').expect(200);
    expect(listAfterDelete.body.map((t) => t.tag)).not.toContain('100%');
  });

  it('renames a tag named "100%" to "50%" without a 500', async () => {
    await request(app).post('/api/tags').send({ tag: '100%' }).expect(200);

    const updateRes = await request(app)
      .put(`/api/tags/${encodeURIComponent('100%')}`)
      .send({ tag: '50%' })
      .expect(200);
    expect(updateRes.body.tag).toBe('50%');
  });

  it('deletes a tag named "a/b" (a segment-separator character) without a 500', async () => {
    await request(app).post('/api/tags').send({ tag: 'a/b' }).expect(200);

    const deleteRes = await request(app)
      .delete(`/api/tags/${encodeURIComponent('a/b')}`)
      .expect(200);
    expect(deleteRes.body.tag).toBe('a/b');
  });

  it('still deletes a plain-text tag correctly (no regression)', async () => {
    await request(app).post('/api/tags').send({ tag: 'plain-tag' }).expect(200);

    const deleteRes = await request(app)
      .delete(`/api/tags/${encodeURIComponent('plain-tag')}`)
      .expect(200);
    expect(deleteRes.body.tag).toBe('plain-tag');
  });
});
