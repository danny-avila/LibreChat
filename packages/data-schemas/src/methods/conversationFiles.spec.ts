import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import type { IConversation } from '../types';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { ConversationMethods, createConversationMethods } from './conversation';
import { createModels } from '../models';

jest.mock('~/config/winston', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}));

let mongoServer: InstanceType<typeof MongoMemoryServer>;
let Conversation: mongoose.Model<IConversation>;
let modelsToCleanup: string[] = [];

const getMessages = jest.fn().mockResolvedValue([]);
const deleteMessages = jest.fn().mockResolvedValue({ deletedCount: 0 });

let methods: ConversationMethods;

const createConvo = (
  user: string,
  files: string[],
  conversationId: string = uuidv4(),
): Promise<IConversation> =>
  Conversation.create({
    conversationId,
    user,
    endpoint: 'openAI',
    files,
  }) as unknown as Promise<IConversation>;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();

  const models = createModels(mongoose);
  modelsToCleanup = Object.keys(models);
  Object.assign(mongoose.models, models);
  Conversation = mongoose.models.Conversation as mongoose.Model<IConversation>;

  methods = createConversationMethods(mongoose, { getMessages, deleteMessages });

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
  jest.clearAllMocks();
});

describe('findConvosWithFiles', () => {
  const user = 'user-1';
  const target = 'convo-target';

  it('returns file ids referenced by the user other conversations', async () => {
    await createConvo(user, ['fileA', 'fileB'], 'convo-other');

    const result = await methods.findConvosWithFiles({
      user,
      excludeConversationId: target,
      fileIds: ['fileA', 'fileB', 'fileC'],
    });

    expect(result.sort()).toEqual(['fileA', 'fileB']);
  });

  it('excludes the conversation being deleted', async () => {
    await createConvo(user, ['fileA'], target);

    const result = await methods.findConvosWithFiles({
      user,
      excludeConversationId: target,
      fileIds: ['fileA'],
    });

    expect(result).toEqual([]);
  });

  it('returns empty array when fileIds is empty', async () => {
    await createConvo(user, ['fileA'], 'convo-other');

    const result = await methods.findConvosWithFiles({
      user,
      excludeConversationId: target,
      fileIds: [],
    });

    expect(result).toEqual([]);
  });

  it('returns empty array when no other conversation references the files', async () => {
    await createConvo(user, ['fileX'], 'convo-other');

    const result = await methods.findConvosWithFiles({
      user,
      excludeConversationId: target,
      fileIds: ['fileA', 'fileB'],
    });

    expect(result).toEqual([]);
  });

  it('does not consider other users conversations', async () => {
    await createConvo('user-2', ['fileA'], 'convo-other-user');

    const result = await methods.findConvosWithFiles({
      user,
      excludeConversationId: target,
      fileIds: ['fileA'],
    });

    expect(result).toEqual([]);
  });

  it('deduplicates a file id referenced by multiple conversations', async () => {
    await createConvo(user, ['fileA'], 'convo-1');
    await createConvo(user, ['fileA'], 'convo-2');

    const result = await methods.findConvosWithFiles({
      user,
      excludeConversationId: target,
      fileIds: ['fileA'],
    });

    expect(result).toEqual(['fileA']);
  });
});
