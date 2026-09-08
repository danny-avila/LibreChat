const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { createModels, createMethods } = require('@librechat/data-schemas');

jest.mock('~/models', () => ({}));
jest.mock('~/server/middleware', () => ({
  requireJwtAuth: (req, res, next) => {
    req.user = { id: 'owner' };
    next();
  },
}));
jest.mock('@librechat/api', () => ({
  generateCheckAccess: () => (req, res, next) => next(),
}));

let mongo;
let app;
let methods;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { autoIndex: false });
  createModels(mongoose);
  methods = createMethods(mongoose);
  Object.assign(require('~/models'), methods);
  app = express();
  app.use(express.json());
  app.use('/tags', require('../tags'));
});

afterEach(async () => {
  jest.restoreAllMocks();
  await mongoose.models.Conversation.deleteMany({});
  await mongoose.models.ConversationTag.deleteMany({});
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

it('returns the created bookmark on success', async () => {
  const response = await request(app).post('/tags').send({ tag: 'bookmark' }).expect(200);
  expect(response.body).toMatchObject({ tag: 'bookmark', count: 0 });
  expect(response.body._id).toEqual(expect.any(String));
});

it('returns a failed response when deletion wins a create-and-attach race', async () => {
  const Conversation = mongoose.models.Conversation;
  await Conversation.create({ user: 'owner', conversationId: 'convo', endpoint: 'openAI' });
  const tag = await methods.createConversationTag('owner', { tag: 'bookmark' });
  const original = Conversation.collection.findOneAndUpdate.bind(Conversation.collection);
  jest
    .spyOn(Conversation.collection, 'findOneAndUpdate')
    .mockImplementationOnce(async (...args) => {
      await methods.deleteConversationTag('owner', String(tag._id), null, true);
      return original(...args);
    });

  const response = await request(app)
    .post('/tags')
    .send({ tag: 'bookmark', addToConversation: true, conversationId: 'convo' })
    .expect(404);

  expect(response.body).toEqual({ error: 'Tag not found' });
  expect(await Conversation.findOne({ conversationId: 'convo' }).lean()).toMatchObject({
    tagIds: [],
  });
  expect(await mongoose.models.ConversationTag.countDocuments({ user: 'owner' })).toBe(0);
});

it.each(['id', 'label'])(
  'accepts unchanged-label reordering through the %s route',
  async (route) => {
    const tag = await methods.createConversationTag('owner', { tag: 'bookmark' });
    await methods.createConversationTag('owner', { tag: 'other' });
    const path = route === 'id' ? `id/${tag._id}` : 'bookmark';
    const response = await request(app)
      .put(`/tags/${path}`)
      .send({ tag: 'bookmark', position: 1 })
      .expect(200);
    expect(response.body).toMatchObject({ _id: String(tag._id), tag: 'bookmark', position: 1 });
    expect(
      await mongoose.models.ConversationTag.findOne({ user: 'owner', tag: 'other' }).lean(),
    ).toMatchObject({ position: 0 });
  },
);

it.each(['id', 'label'])(
  'rejects an actual combined rename/reorder through the %s route',
  async (route) => {
    const tag = await methods.createConversationTag('owner', { tag: 'bookmark' });
    const path = route === 'id' ? `id/${tag._id}` : 'bookmark';
    const response = await request(app)
      .put(`/tags/${path}`)
      .send({ tag: 'renamed', position: 1 })
      .expect(400);
    expect(response.body).toEqual({ error: 'Rename and position changes must be sent separately' });
    expect(await mongoose.models.ConversationTag.findById(tag._id).lean()).toMatchObject({
      tag: 'bookmark',
      position: 0,
    });
  },
);

it.each(['put', 'delete'])(
  'rejects malformed IDs on the %s identity route without a lookup',
  async (method) => {
    const find = jest.spyOn(mongoose.models.ConversationTag.collection, 'findOne');
    const remove = jest.spyOn(mongoose.models.ConversationTag.collection, 'findOneAndDelete');
    await request(app)[method]('/tags/id/not-an-id').send({ tag: 'bookmark' }).expect(400);
    expect(find).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  },
);

it('rejects malformed membership IDs before changing a conversation', async () => {
  const write = jest.spyOn(mongoose.models.Conversation.collection, 'findOneAndUpdate');
  await request(app)
    .put('/tags/convo/convo')
    .send({ tagIds: ['not-an-id'] })
    .expect(400);
  expect(write).not.toHaveBeenCalled();
});

it('keeps database failures as server errors', async () => {
  const tag = await methods.createConversationTag('owner', { tag: 'bookmark' });
  jest
    .spyOn(mongoose.models.ConversationTag.collection, 'findOne')
    .mockRejectedValueOnce(new Error('DB unavailable'));
  const response = await request(app)
    .put(`/tags/id/${tag._id}`)
    .send({ description: 'note' })
    .expect(500);
  expect(response.body).toEqual({ error: 'Internal server error' });
});
