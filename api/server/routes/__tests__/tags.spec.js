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

it.each(['missing', 'deleted', 'foreign'])(
  'returns404 for a %s membership identity without changing existing tags',
  async (kind) => {
    const retained = await methods.createConversationTag('owner', { tag: 'retained' });
    await mongoose.models.Conversation.create({
      user: 'owner',
      conversationId: 'convo',
      endpoint: 'openAI',
      tagIds: [String(retained._id)],
    });
    let missingId = new mongoose.Types.ObjectId().toString();
    if (kind === 'deleted') {
      const deleted = await methods.createConversationTag('owner', { tag: 'deleted' });
      missingId = String(deleted._id);
      await methods.deleteConversationTag('owner', missingId, null, true);
    } else if (kind === 'foreign') {
      const foreign = await methods.createConversationTag('other-owner', { tag: 'foreign' });
      missingId = String(foreign._id);
    }
    const write = jest.spyOn(mongoose.models.Conversation.collection, 'findOneAndUpdate');
    const response = await request(app)
      .put('/tags/convo/convo')
      .send({ tagIds: [missingId] })
      .expect(404);
    expect(response.body).toEqual({ error: 'Tag not found' });
    expect(write).not.toHaveBeenCalled();
    expect(
      await mongoose.models.Conversation.findOne({ user: 'owner', conversationId: 'convo' }).lean(),
    ).toMatchObject({ tagIds: [String(retained._id)] });
  },
);

it.each(['missing', 'deleted', 'foreign'])(
  'returns404 for a %s create-and-attach target and retains its catalog identity for retry',
  async (kind) => {
    const Conversation = mongoose.models.Conversation;
    if (kind !== 'missing') {
      await Conversation.create({
        user: kind === 'foreign' ? 'other-owner' : 'owner',
        conversationId: 'target',
        endpoint: 'openAI',
        tagIds: [],
      });
    }
    if (kind === 'deleted') {
      const original = Conversation.collection.findOneAndUpdate.bind(Conversation.collection);
      jest
        .spyOn(Conversation.collection, 'findOneAndUpdate')
        .mockImplementationOnce(async (...args) => {
          await Conversation.deleteOne({ user: 'owner', conversationId: 'target' });
          return original(...args);
        });
    }
    const response = await request(app)
      .post('/tags')
      .send({ tag: 'retained', addToConversation: true, conversationId: 'target' })
      .expect(404);
    expect(response.body).toEqual({ error: 'Conversation not found' });
    const retained = await mongoose.models.ConversationTag.findOne({ user: 'owner' }).lean();
    expect(retained).toMatchObject({ tag: 'retained' });
    expect(await methods.getConversationTags('owner')).toEqual([
      expect.objectContaining({ _id: retained._id, count: 0 }),
    ]);
    if (kind === 'foreign') {
      expect(await Conversation.findOne({ conversationId: 'target' }).lean()).toMatchObject({
        user: 'other-owner',
        tagIds: [],
      });
    }
    await Conversation.create({
      user: 'owner',
      conversationId: 'retry-target',
      endpoint: 'openAI',
      tagIds: [],
    });
    const retry = await request(app)
      .post('/tags')
      .send({ tag: 'retained', addToConversation: true, conversationId: 'retry-target' })
      .expect(200);
    expect(retry.body).toMatchObject({ _id: String(retained._id), count: 1 });
    expect(await mongoose.models.ConversationTag.countDocuments({ user: 'owner' })).toBe(1);
  },
);

it.each(['missing', 'deleted', 'foreign'])(
  'returns404 when a %s conversation cannot receive a membership update',
  async (kind) => {
    const Conversation = mongoose.models.Conversation;
    const retained = await methods.createConversationTag('owner', { tag: 'retained' });
    if (kind !== 'missing') {
      await Conversation.create({
        user: kind === 'foreign' ? 'other-owner' : 'owner',
        conversationId: 'target',
        endpoint: 'openAI',
        tagIds: [],
      });
    }
    if (kind === 'deleted') {
      const original = Conversation.collection.findOneAndUpdate.bind(Conversation.collection);
      jest
        .spyOn(Conversation.collection, 'findOneAndUpdate')
        .mockImplementationOnce(async (...args) => {
          await Conversation.deleteOne({ user: 'owner', conversationId: 'target' });
          return original(...args);
        });
    }
    const response = await request(app)
      .put('/tags/convo/target')
      .send({ tagIds: [String(retained._id)] })
      .expect(404);
    expect(response.body).toEqual({ error: 'Conversation not found' });
    expect(await mongoose.models.ConversationTag.findById(retained._id).lean()).not.toBeNull();
    if (kind === 'foreign') {
      expect(await Conversation.findOne({ conversationId: 'target' }).lean()).toMatchObject({
        user: 'other-owner',
        tagIds: [],
      });
    }
  },
);

it('preserves server errors when the attachment database write fails', async () => {
  await mongoose.models.Conversation.create({
    user: 'owner',
    conversationId: 'target',
    endpoint: 'openAI',
  });
  jest
    .spyOn(mongoose.models.Conversation.collection, 'findOneAndUpdate')
    .mockRejectedValueOnce(new Error('DB unavailable'));
  const response = await request(app)
    .post('/tags')
    .send({ tag: 'retained', addToConversation: true, conversationId: 'target' })
    .expect(500);
  expect(response.body).toEqual({ error: 'Internal server error' });
});
