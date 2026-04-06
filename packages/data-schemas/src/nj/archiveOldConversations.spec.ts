import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { IConversation } from '~/types';
import { createModels } from '~/models';
import { archiveOldConversations } from './archiveOldConversations';

jest.mock('~/config/winston', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}));

let mongoServer: InstanceType<typeof MongoMemoryServer>;
let Conversation: mongoose.Model<IConversation>;
let modelsToCleanup: string[] = [];

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

async function insertConvo({
  createdAt = daysAgo(90),
  updatedAt = daysAgo(61), // default: old enough to archive
  isArchived = false,
}: {
  createdAt?: Date;
  updatedAt?: Date;
  isArchived?: boolean;
} = {}): Promise<IConversation> {
  const doc = {
    conversationId: uuidv4(),
    user: 'user-nj-test',
    title: 'Test Conversation',
    createdAt,
    updatedAt,
    isArchived,
  };
  await Conversation.collection.insertOne(doc);
  return Conversation.findOne({
    conversationId: doc.conversationId,
  }).lean() as Promise<IConversation>;
}

describe('archiveOldConversations', () => {
  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();

    const models = createModels(mongoose);
    modelsToCleanup = Object.keys(models);
    Object.assign(mongoose.models, models);
    Conversation = mongoose.models.Conversation as mongoose.Model<IConversation>;

    await mongoose.connect(mongoUri);
  });

  afterAll(async () => {
    const collections = mongoose.connection.collections;
    for (const key in collections) {
      await collections[key].deleteMany({});
    }

    for (const modelName of modelsToCleanup) {
      if (mongoose.models[modelName]) {
        delete mongoose.models[modelName];
      }
    }

    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await Conversation.deleteMany({});
  });

  it('archives conversations not updated in more than 60 days', async () => {
    await insertConvo({ updatedAt: daysAgo(61) });
    await insertConvo({ updatedAt: daysAgo(90) });

    const result = await archiveOldConversations(mongoose);

    expect(result).toBe(2);
    const docs = await Conversation.find({ user: 'user-nj-test' }).lean();
    expect(docs.every((d) => d.isArchived)).toBe(true);
  });

  it('does not archive conversations updated within the last 60 days', async () => {
    await insertConvo({ updatedAt: daysAgo(59) });
    await insertConvo({ updatedAt: daysAgo(1) });

    const result = await archiveOldConversations(mongoose);

    expect(result).toBe(0);
    const docs = await Conversation.find({ user: 'user-nj-test' }).lean();
    expect(docs.every((d) => !d.isArchived)).toBe(true);
  });

  it('only archives stale conversations and leaves recently-updated ones untouched', async () => {
    const stale = await insertConvo({ updatedAt: daysAgo(90) });
    const active = await insertConvo({ updatedAt: daysAgo(10) });

    await archiveOldConversations(mongoose);

    const staleDoc = await Conversation.findOne({ conversationId: stale.conversationId }).lean();
    const activeDoc = await Conversation.findOne({ conversationId: active.conversationId }).lean();
    expect(staleDoc?.isArchived).toBe(true);
    expect(activeDoc?.isArchived).toBe(false);
  });

  it('does not archive a recently-updated conversation even if it was created long ago', async () => {
    await insertConvo({ createdAt: daysAgo(365), updatedAt: daysAgo(5) });

    const result = await archiveOldConversations(mongoose);

    expect(result).toBe(0);
  });

  it('does not archive already-archived conversations', async () => {
    await insertConvo({ isArchived: true });

    const result = await archiveOldConversations(mongoose);

    expect(result).toBe(0);
  });

  it('no ops when there are no conversations', async () => {
    const result = await archiveOldConversations(mongoose);
    expect(result).toBe(0);
  });
});
