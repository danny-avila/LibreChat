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
