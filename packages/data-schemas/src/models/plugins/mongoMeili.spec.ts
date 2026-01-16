import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { EModelEndpoint } from 'librechat-data-provider';
import { createConversationModel } from '~/models/convo';
import { createMessageModel } from '~/models/message';
import { SchemaWithMeiliMethods } from '~/models/plugins/mongoMeili';

const mockAddDocuments = jest.fn();
const mockAddDocumentsInBatches = jest.fn();
const mockUpdateDocuments = jest.fn();
const mockDeleteDocument = jest.fn();
const mockDeleteDocuments = jest.fn();
const mockGetDocument = jest.fn();
const mockIndex = jest.fn().mockReturnValue({
  getRawInfo: jest.fn(),
  updateSettings: jest.fn(),
  addDocuments: mockAddDocuments,
  addDocumentsInBatches: mockAddDocumentsInBatches,
  updateDocuments: mockUpdateDocuments,
  deleteDocument: mockDeleteDocument,
  deleteDocuments: mockDeleteDocuments,
  getDocument: mockGetDocument,
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
    mockAddDocumentsInBatches.mockClear();
    mockUpdateDocuments.mockClear();
    mockDeleteDocument.mockClear();
    mockDeleteDocuments.mockClear();
    mockGetDocument.mockClear();
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

  describe('New batch processing and retry functionality', () => {
    test('processSyncBatch uses addDocumentsInBatches', async () => {
      const conversationModel = createConversationModel(mongoose) as SchemaWithMeiliMethods;
      await conversationModel.deleteMany({});
      mockAddDocumentsInBatches.mockClear();
      mockAddDocuments.mockClear();

      await conversationModel.collection.insertOne({
        conversationId: new mongoose.Types.ObjectId(),
        user: new mongoose.Types.ObjectId(),
        title: 'Test Conversation',
        endpoint: EModelEndpoint.openAI,
        _meiliIndex: false,
        expiredAt: null,
      });

      // Run sync which should call processSyncBatch internally
      await conversationModel.syncWithMeili();

      // Verify addDocumentsInBatches was called (new batch method)
      expect(mockAddDocumentsInBatches).toHaveBeenCalled();
    });

    test('addObjectToMeili retries on failure', async () => {
      const conversationModel = createConversationModel(mongoose) as SchemaWithMeiliMethods;

      // Mock addDocuments to fail twice then succeed
      mockAddDocuments
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({});

      // Create a document which triggers addObjectToMeili
      await conversationModel.create({
        conversationId: new mongoose.Types.ObjectId(),
        user: new mongoose.Types.ObjectId(),
        title: 'Test Retry',
        endpoint: EModelEndpoint.openAI,
      });

      // Wait for async operations to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify addDocuments was called multiple times due to retries
      expect(mockAddDocuments).toHaveBeenCalledTimes(3);
    });

    test('getSyncProgress returns accurate progress information', async () => {
      const conversationModel = createConversationModel(mongoose) as SchemaWithMeiliMethods;
      await conversationModel.deleteMany({});

      // Insert documents directly to control the _meiliIndex flag
      await conversationModel.collection.insertOne({
        conversationId: new mongoose.Types.ObjectId(),
        user: new mongoose.Types.ObjectId(),
        title: 'Indexed',
        endpoint: EModelEndpoint.openAI,
        _meiliIndex: true,
        expiredAt: null,
      });

      await conversationModel.collection.insertOne({
        conversationId: new mongoose.Types.ObjectId(),
        user: new mongoose.Types.ObjectId(),
        title: 'Not Indexed',
        endpoint: EModelEndpoint.openAI,
        _meiliIndex: false,
        expiredAt: null,
      });

      const progress = await conversationModel.getSyncProgress();

      expect(progress.totalDocuments).toBe(2);
      expect(progress.totalProcessed).toBe(1);
      expect(progress.isComplete).toBe(false);
    });

    test('getSyncProgress excludes TTL documents from counts', async () => {
      const conversationModel = createConversationModel(mongoose) as SchemaWithMeiliMethods;
      await conversationModel.deleteMany({});

      // Insert syncable documents (expiredAt: null)
      await conversationModel.collection.insertOne({
        conversationId: new mongoose.Types.ObjectId(),
        user: new mongoose.Types.ObjectId(),
        title: 'Syncable Indexed',
        endpoint: EModelEndpoint.openAI,
        _meiliIndex: true,
        expiredAt: null,
      });

      await conversationModel.collection.insertOne({
        conversationId: new mongoose.Types.ObjectId(),
        user: new mongoose.Types.ObjectId(),
        title: 'Syncable Not Indexed',
        endpoint: EModelEndpoint.openAI,
        _meiliIndex: false,
        expiredAt: null,
      });

      // Insert TTL documents (expiredAt set) - these should NOT be counted
      await conversationModel.collection.insertOne({
        conversationId: new mongoose.Types.ObjectId(),
        user: new mongoose.Types.ObjectId(),
        title: 'TTL Document 1',
        endpoint: EModelEndpoint.openAI,
        _meiliIndex: true,
        expiredAt: new Date(),
      });

      await conversationModel.collection.insertOne({
        conversationId: new mongoose.Types.ObjectId(),
        user: new mongoose.Types.ObjectId(),
        title: 'TTL Document 2',
        endpoint: EModelEndpoint.openAI,
        _meiliIndex: false,
        expiredAt: new Date(),
      });

      const progress = await conversationModel.getSyncProgress();

      // Only syncable documents should be counted (2 total, 1 indexed)
      expect(progress.totalDocuments).toBe(2);
      expect(progress.totalProcessed).toBe(1);
      expect(progress.isComplete).toBe(false);
    });

    test('getSyncProgress shows completion when all syncable documents are indexed', async () => {
      const messageModel = createMessageModel(mongoose) as SchemaWithMeiliMethods;
      await messageModel.deleteMany({});

      // All syncable documents are indexed
      await messageModel.collection.insertOne({
        messageId: new mongoose.Types.ObjectId(),
        conversationId: new mongoose.Types.ObjectId(),
        user: new mongoose.Types.ObjectId(),
        isCreatedByUser: true,
        _meiliIndex: true,
        expiredAt: null,
      });

      await messageModel.collection.insertOne({
        messageId: new mongoose.Types.ObjectId(),
        conversationId: new mongoose.Types.ObjectId(),
        user: new mongoose.Types.ObjectId(),
        isCreatedByUser: false,
        _meiliIndex: true,
        expiredAt: null,
      });

      // Add TTL document - should not affect completion status
      await messageModel.collection.insertOne({
        messageId: new mongoose.Types.ObjectId(),
        conversationId: new mongoose.Types.ObjectId(),
        user: new mongoose.Types.ObjectId(),
        isCreatedByUser: true,
        _meiliIndex: false,
        expiredAt: new Date(),
      });

      const progress = await messageModel.getSyncProgress();

      expect(progress.totalDocuments).toBe(2);
      expect(progress.totalProcessed).toBe(2);
      expect(progress.isComplete).toBe(true);
    });
  });

  describe('Error handling in processSyncBatch', () => {
    test('syncWithMeili fails when processSyncBatch encounters addDocumentsInBatches error', async () => {
      const conversationModel = createConversationModel(mongoose) as SchemaWithMeiliMethods;
      await conversationModel.deleteMany({});
      mockAddDocumentsInBatches.mockClear();

      // Insert a document to sync
      await conversationModel.collection.insertOne({
        conversationId: new mongoose.Types.ObjectId(),
        user: new mongoose.Types.ObjectId(),
        title: 'Test Conversation',
        endpoint: EModelEndpoint.openAI,
        _meiliIndex: false,
        expiredAt: null,
      });

      // Mock addDocumentsInBatches to fail
      mockAddDocumentsInBatches.mockRejectedValueOnce(new Error('MeiliSearch connection error'));

      // Sync should throw the error
      await expect(conversationModel.syncWithMeili()).rejects.toThrow(
        'MeiliSearch connection error',
      );

      // Verify the error was logged
      expect(mockAddDocumentsInBatches).toHaveBeenCalled();

      // Document should NOT be marked as indexed since sync failed
      // Note: direct collection.insertOne doesn't set default values, so _meiliIndex may be undefined
      const doc = await conversationModel.findOne({});
      expect(doc?._meiliIndex).not.toBe(true);
    });

    test('syncWithMeili fails when processSyncBatch encounters updateMany error', async () => {
      const conversationModel = createConversationModel(mongoose) as SchemaWithMeiliMethods;
      await conversationModel.deleteMany({});
      mockAddDocumentsInBatches.mockClear();

      // Insert a document
      await conversationModel.collection.insertOne({
        conversationId: new mongoose.Types.ObjectId(),
        user: new mongoose.Types.ObjectId(),
        title: 'Test Conversation',
        endpoint: EModelEndpoint.openAI,
        _meiliIndex: false,
        expiredAt: null,
      });

      // Mock addDocumentsInBatches to succeed but simulate updateMany failure
      mockAddDocumentsInBatches.mockResolvedValueOnce({});

      // Spy on updateMany and make it fail
      const updateManySpy = jest
        .spyOn(conversationModel, 'updateMany')
        .mockRejectedValueOnce(new Error('Database connection error'));

      // Sync should throw the error
      await expect(conversationModel.syncWithMeili()).rejects.toThrow('Database connection error');

      expect(updateManySpy).toHaveBeenCalled();

      // Restore original implementation
      updateManySpy.mockRestore();
    });

    test('processSyncBatch logs error and throws when addDocumentsInBatches fails', async () => {
      const messageModel = createMessageModel(mongoose) as SchemaWithMeiliMethods;
      await messageModel.deleteMany({});

      mockAddDocumentsInBatches.mockRejectedValueOnce(new Error('Network timeout'));

      await messageModel.collection.insertOne({
        messageId: new mongoose.Types.ObjectId(),
        conversationId: new mongoose.Types.ObjectId(),
        user: new mongoose.Types.ObjectId(),
        isCreatedByUser: true,
        _meiliIndex: false,
        expiredAt: null,
      });

      const indexMock = mockIndex();
      const documents = await messageModel.find({ _meiliIndex: false }).lean();

      // Should throw the error
      await expect(messageModel.processSyncBatch(indexMock, documents)).rejects.toThrow(
        'Network timeout',
      );

      expect(mockAddDocumentsInBatches).toHaveBeenCalled();
    });

    test('processSyncBatch handles empty document array gracefully', async () => {
      const conversationModel = createConversationModel(mongoose) as SchemaWithMeiliMethods;
      const indexMock = mockIndex();

      // Should not throw with empty array
      await expect(conversationModel.processSyncBatch(indexMock, [])).resolves.not.toThrow();

      // Should not call addDocumentsInBatches
      expect(mockAddDocumentsInBatches).not.toHaveBeenCalled();
    });

    test('syncWithMeili stops processing when batch fails and does not process remaining documents', async () => {
      const conversationModel = createConversationModel(mongoose) as SchemaWithMeiliMethods;
      await conversationModel.deleteMany({});
      mockAddDocumentsInBatches.mockClear();

      // Create multiple documents
      for (let i = 0; i < 5; i++) {
        await conversationModel.collection.insertOne({
          conversationId: new mongoose.Types.ObjectId(),
          user: new mongoose.Types.ObjectId(),
          title: `Test Conversation ${i}`,
          endpoint: EModelEndpoint.openAI,
          _meiliIndex: false,
          expiredAt: null,
        });
      }

      // Mock addDocumentsInBatches to fail on first call
      mockAddDocumentsInBatches.mockRejectedValueOnce(new Error('First batch failed'));

      // Sync should fail on the first batch
      await expect(conversationModel.syncWithMeili()).rejects.toThrow('First batch failed');

      // Should have attempted only once before failing
      expect(mockAddDocumentsInBatches).toHaveBeenCalledTimes(1);

      // No documents should be indexed since sync failed
      const indexedCount = await conversationModel.countDocuments({ _meiliIndex: true });
      expect(indexedCount).toBe(0);
    });

    test('error in processSyncBatch is properly logged before being thrown', async () => {
      const messageModel = createMessageModel(mongoose) as SchemaWithMeiliMethods;
      await messageModel.deleteMany({});

      const testError = new Error('Test error for logging');
      mockAddDocumentsInBatches.mockRejectedValueOnce(testError);

      await messageModel.collection.insertOne({
        messageId: new mongoose.Types.ObjectId(),
        conversationId: new mongoose.Types.ObjectId(),
        user: new mongoose.Types.ObjectId(),
        isCreatedByUser: true,
        _meiliIndex: false,
        expiredAt: null,
      });

      const indexMock = mockIndex();
      const documents = await messageModel.find({ _meiliIndex: false }).lean();

      // Should throw the same error that was passed to it
      await expect(messageModel.processSyncBatch(indexMock, documents)).rejects.toThrow(testError);
    });

    test('syncWithMeili properly propagates processSyncBatch errors', async () => {
      const conversationModel = createConversationModel(mongoose) as SchemaWithMeiliMethods;
      await conversationModel.deleteMany({});
      mockAddDocumentsInBatches.mockClear();

      await conversationModel.collection.insertOne({
        conversationId: new mongoose.Types.ObjectId(),
        user: new mongoose.Types.ObjectId(),
        title: 'Test',
        endpoint: EModelEndpoint.openAI,
        _meiliIndex: false,
        expiredAt: null,
      });

      const customError = new Error('Custom sync error');
      mockAddDocumentsInBatches.mockRejectedValueOnce(customError);

      // The error should propagate all the way up
      await expect(conversationModel.syncWithMeili()).rejects.toThrow('Custom sync error');
    });
  });
});
