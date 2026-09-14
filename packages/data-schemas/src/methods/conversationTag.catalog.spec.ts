import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { IConversation } from '~/types';
import { createConversationTagModel } from '~/models/conversationTag';
import { createConversationTagMethods } from './conversationTag';
import { createConversationModel } from '~/models/convo';

describe('conversation tag catalog projections', () => {
  let server: MongoMemoryServer;
  let Conversation: mongoose.Model<IConversation>;
  let Tag: ReturnType<typeof createConversationTagModel>;
  let methods: ReturnType<typeof createConversationTagMethods>;

  beforeAll(async () => {
    server = await MongoMemoryServer.create();
    await mongoose.connect(server.getUri(), { autoIndex: false });
    Conversation = createConversationModel(mongoose);
    Tag = createConversationTagModel(mongoose);
    methods = createConversationTagMethods(mongoose);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await Conversation.deleteMany({});
    await Tag.deleteMany({});
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await server.stop();
  });

  it('does no membership work for an identity-only catalog over dense tagged history', async () => {
    const tag = await Tag.create({ user: 'owner', tag: 'Used', position: 0, count: 999 });
    await Conversation.collection.insertMany(
      Array.from({ length: 3000 }, (_, index) => ({
        user: 'owner',
        conversationId: `tagged-${index}`,
        tagIds: [String(tag._id)],
      })),
    );
    const aggregate = jest.spyOn(Conversation, 'aggregate');
    const countDocuments = jest.spyOn(Conversation, 'countDocuments');

    await expect(methods.getConversationTags('owner', null, false)).resolves.toEqual([
      expect.objectContaining({ _id: tag._id, tag: 'Used' }),
    ]);
    expect((await methods.getConversationTags('owner', null, false))[0]).not.toHaveProperty(
      'count',
    );
    expect(aggregate).not.toHaveBeenCalled();
    expect(countDocuments).not.toHaveBeenCalled();
  });

  it('keeps exact membership counts on the default compatibility projection', async () => {
    const tag = await Tag.create({ user: 'owner', tag: 'Used', position: 0, count: 999 });
    await Conversation.create({
      user: 'owner',
      conversationId: 'tagged',
      endpoint: 'openAI',
      tagIds: [String(tag._id), String(tag._id)],
    });

    await expect(methods.getConversationTags('owner')).resolves.toEqual([
      expect.objectContaining({ _id: tag._id, tag: 'Used', count: 1 }),
    ]);
  });

  it.each(['create', 'update'] as const)(
    'avoids membership counts for an identity-only %s response',
    async (operation) => {
      const existing = await Tag.create({ user: 'owner', tag: 'Old', position: 0, count: 999 });
      const countDocuments = jest.spyOn(Conversation, 'countDocuments');
      const result =
        operation === 'create'
          ? await methods.createConversationTag('owner', { tag: 'Created' }, null, false)
          : await methods.updateConversationTag(
              'owner',
              String(existing._id),
              { tag: 'Updated' },
              null,
              true,
              false,
            );
      expect(result).not.toHaveProperty('count');
      expect(countDocuments).not.toHaveBeenCalled();
    },
  );
});
