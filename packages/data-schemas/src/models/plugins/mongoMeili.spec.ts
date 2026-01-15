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

  test('saving conversation indexes with expiredAt=null w/ meilisearch', async () => {
    await createConversationModel(mongoose).create({
      conversationId: new mongoose.Types.ObjectId(),
      user: new mongoose.Types.ObjectId(),
      title: 'Test Conversation',
      endpoint: EModelEndpoint.openAI,
      expiredAt: null,
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

  test('saving messages with expiredAt=null indexes w/ meilisearch', async () => {
    await createMessageModel(mongoose).create({
      messageId: new mongoose.Types.ObjectId(),
      conversationId: new mongoose.Types.ObjectId(),
      user: new mongoose.Types.ObjectId(),
      isCreatedByUser: true,
      expiredAt: null,
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

  describe('estimatedDocumentCount usage in syncWithMeili', () => {
    test('syncWithMeili completes successfully with estimatedDocumentCount', async () => {
      // Clear any previous documents
      const conversationModel = createConversationModel(mongoose) as SchemaWithMeiliMethods;
      await conversationModel.deleteMany({});

      // Create test documents
      await conversationModel.create({
        conversationId: new mongoose.Types.ObjectId(),
        user: new mongoose.Types.ObjectId(),
        title: 'Test Conversation 1',
        endpoint: EModelEndpoint.openAI,
      });

      await conversationModel.create({
        conversationId: new mongoose.Types.ObjectId(),
        user: new mongoose.Types.ObjectId(),
        title: 'Test Conversation 2',
        endpoint: EModelEndpoint.openAI,
      });

      // Trigger sync - should use estimatedDocumentCount internally
      await expect(conversationModel.syncWithMeili()).resolves.not.toThrow();

      // Verify documents were processed
      expect(mockAddDocuments).toHaveBeenCalled();
    });

    test('syncWithMeili handles empty collection correctly', async () => {
      const messageModel = createMessageModel(mongoose) as SchemaWithMeiliMethods;
      await messageModel.deleteMany({});

      // Verify collection is empty
      const count = await messageModel.estimatedDocumentCount();
      expect(count).toBe(0);

      // Sync should complete without error even with 0 estimated documents
      await expect(messageModel.syncWithMeili()).resolves.not.toThrow();
    });

    test('estimatedDocumentCount returns count for non-empty collection', async () => {
      const conversationModel = createConversationModel(mongoose) as SchemaWithMeiliMethods;
      await conversationModel.deleteMany({});

      // Create documents
      await conversationModel.create({
        conversationId: new mongoose.Types.ObjectId(),
        user: new mongoose.Types.ObjectId(),
        title: 'Test 1',
        endpoint: EModelEndpoint.openAI,
      });

      await conversationModel.create({
        conversationId: new mongoose.Types.ObjectId(),
        user: new mongoose.Types.ObjectId(),
        title: 'Test 2',
        endpoint: EModelEndpoint.openAI,
      });

      const estimatedCount = await conversationModel.estimatedDocumentCount();
      expect(estimatedCount).toBeGreaterThanOrEqual(2);
    });

    test('estimatedDocumentCount is available on model', async () => {
      const messageModel = createMessageModel(mongoose) as SchemaWithMeiliMethods;

      // Verify the method exists and is callable
      expect(typeof messageModel.estimatedDocumentCount).toBe('function');

      // Should be able to call it
      const result = await messageModel.estimatedDocumentCount();
      expect(typeof result).toBe('number');
      expect(result).toBeGreaterThanOrEqual(0);
    });

    test('syncWithMeili handles mix of syncable and TTL documents correctly', async () => {
      const messageModel = createMessageModel(mongoose) as SchemaWithMeiliMethods;
      await messageModel.deleteMany({});
      mockAddDocuments.mockClear();

      // Create syncable documents (expiredAt: null)
      await messageModel.create({
        messageId: new mongoose.Types.ObjectId(),
        conversationId: new mongoose.Types.ObjectId(),
        user: new mongoose.Types.ObjectId(),
        isCreatedByUser: true,
        expiredAt: null,
      });

      await messageModel.create({
        messageId: new mongoose.Types.ObjectId(),
        conversationId: new mongoose.Types.ObjectId(),
        user: new mongoose.Types.ObjectId(),
        isCreatedByUser: false,
        expiredAt: null,
      });

      // Create TTL documents (expiredAt set to a date)
      await messageModel.create({
        messageId: new mongoose.Types.ObjectId(),
        conversationId: new mongoose.Types.ObjectId(),
        user: new mongoose.Types.ObjectId(),
        isCreatedByUser: true,
        expiredAt: new Date(),
      });

      await messageModel.create({
        messageId: new mongoose.Types.ObjectId(),
        conversationId: new mongoose.Types.ObjectId(),
        user: new mongoose.Types.ObjectId(),
        isCreatedByUser: false,
        expiredAt: new Date(),
      });

      // estimatedDocumentCount should count all documents (both syncable and TTL)
      const estimatedCount = await messageModel.estimatedDocumentCount();
      expect(estimatedCount).toBe(4);

      // Actual syncable documents (expiredAt: null)
      const syncableCount = await messageModel.countDocuments({ expiredAt: null });
      expect(syncableCount).toBe(2);

      // Sync should complete successfully even though estimated count is higher than processed count
      await expect(messageModel.syncWithMeili()).resolves.not.toThrow();

      // Only syncable documents should be indexed (2 documents, not 4)
      // The mock should be called once per batch, and we have 2 documents
      expect(mockAddDocuments).toHaveBeenCalled();

      // Verify that only 2 documents were indexed (the syncable ones)
      const indexedCount = await messageModel.countDocuments({ _meiliIndex: true });
      expect(indexedCount).toBe(2);
    });
  });
});
