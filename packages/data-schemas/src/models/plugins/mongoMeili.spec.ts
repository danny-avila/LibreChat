import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { EModelEndpoint } from 'librechat-data-provider';
import { createConversationModel } from '~/models/convo';
import { createMessageModel } from '~/models/message';
import { SchemaWithMeiliMethods } from '~/models/plugins/mongoMeili';

const mockAddDocuments = jest.fn();
const mockIndex = jest.fn().mockReturnValue({
  getRawInfo: jest.fn(),
  updateSettings: jest.fn(),
  addDocuments: mockAddDocuments,
  getDocuments: jest.fn().mockReturnValue({ results: [] }),
});
jest.mock('meilisearch', () => {
  return {
    MeiliSearch: jest.fn().mockImplementation(() => {
      return {
        index: mockIndex,
      };
    }),
  };
});

describe('Meilisearch Mongoose plugin', () => {
  const OLD_ENV = process.env;

  let mongoServer: MongoMemoryServer;

  beforeAll(async () => {
    process.env = {
      ...OLD_ENV,
      // Set a fake meilisearch host/key so that we activate the meilisearch plugin
      MEILI_HOST: 'foo',
      MEILI_MASTER_KEY: 'bar',
    };

    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);
  });

  beforeEach(() => {
    mockAddDocuments.mockClear();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();

    process.env = OLD_ENV;
  });

  test('saving conversation indexes w/ meilisearch', async () => {
    await createConversationModel(mongoose).create({
      conversationId: new mongoose.Types.ObjectId(),
      user: new mongoose.Types.ObjectId(),
      title: 'Test Conversation',
      endpoint: EModelEndpoint.openAI,
    });
    expect(mockAddDocuments).toHaveBeenCalled();
  });

  test('saving TTL conversation does NOT index w/ meilisearch', async () => {
    await createConversationModel(mongoose).create({
      conversationId: new mongoose.Types.ObjectId(),
      user: new mongoose.Types.ObjectId(),
      title: 'Test Conversation',
      endpoint: EModelEndpoint.openAI,
      expiredAt: new Date(),
    });
    expect(mockAddDocuments).not.toHaveBeenCalled();
  });

  test('saving messages indexes w/ meilisearch', async () => {
    await createMessageModel(mongoose).create({
      messageId: new mongoose.Types.ObjectId(),
      conversationId: new mongoose.Types.ObjectId(),
      user: new mongoose.Types.ObjectId(),
      isCreatedByUser: true,
    });
    expect(mockAddDocuments).toHaveBeenCalled();
  });

  test('saving TTL messages does NOT index w/ meilisearch', async () => {
    await createMessageModel(mongoose).create({
      messageId: new mongoose.Types.ObjectId(),
      conversationId: new mongoose.Types.ObjectId(),
      user: new mongoose.Types.ObjectId(),
      isCreatedByUser: true,
      expiredAt: new Date(),
    });
    expect(mockAddDocuments).not.toHaveBeenCalled();
  });

  test('sync w/ meili does not include TTL documents', async () => {
    const conversationModel = createConversationModel(mongoose) as SchemaWithMeiliMethods;
    await conversationModel.create({
      conversationId: new mongoose.Types.ObjectId(),
      user: new mongoose.Types.ObjectId(),
      title: 'Test Conversation',
      endpoint: EModelEndpoint.openAI,
      expiredAt: new Date(),
    });

    await conversationModel.syncWithMeili();

    expect(mockAddDocuments).not.toHaveBeenCalled();
  });
});
