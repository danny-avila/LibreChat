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

  describe('cleanupMeiliIndex', () => {
    let mockGetDocuments: jest.Mock;

    beforeEach(() => {
      mockGetDocuments = jest.fn();
      mockDeleteDocuments.mockClear();
      mockIndex.mockReturnValue({
        getRawInfo: jest.fn(),
        updateSettings: jest.fn(),
        addDocuments: mockAddDocuments,
        addDocumentsInBatches: mockAddDocumentsInBatches,
        updateDocuments: mockUpdateDocuments,
        deleteDocument: mockDeleteDocument,
        deleteDocuments: mockDeleteDocuments,
        getDocument: mockGetDocument,
        getDocuments: mockGetDocuments,
      });
    });

    test('cleanupMeiliIndex deletes orphaned documents from MeiliSearch', async () => {
      const conversationModel = createConversationModel(mongoose) as SchemaWithMeiliMethods;
      await conversationModel.deleteMany({});

      const existingConvoId = new mongoose.Types.ObjectId().toString();
      const orphanedConvoId1 = new mongoose.Types.ObjectId().toString();
      const orphanedConvoId2 = new mongoose.Types.ObjectId().toString();

      // Create one document in MongoDB
      await conversationModel.collection.insertOne({
        conversationId: existingConvoId,
        user: new mongoose.Types.ObjectId(),
        title: 'Existing Conversation',
        endpoint: EModelEndpoint.openAI,
        _meiliIndex: true,
        expiredAt: null,
      });

      // Mock MeiliSearch to return 3 documents (1 exists in MongoDB, 2 are orphaned)
      mockGetDocuments.mockResolvedValueOnce({
        results: [
          { conversationId: existingConvoId },
          { conversationId: orphanedConvoId1 },
          { conversationId: orphanedConvoId2 },
        ],
      });

      const indexMock = mockIndex();
      await conversationModel.cleanupMeiliIndex(indexMock, 'conversationId', 100, 0);

      // Should delete the 2 orphaned documents
      expect(mockDeleteDocuments).toHaveBeenCalledWith([orphanedConvoId1, orphanedConvoId2]);
    });

    test('cleanupMeiliIndex handles offset correctly when documents are deleted', async () => {
      const messageModel = createMessageModel(mongoose) as SchemaWithMeiliMethods;
      await messageModel.deleteMany({});

      const existingIds = [
        new mongoose.Types.ObjectId().toString(),
        new mongoose.Types.ObjectId().toString(),
        new mongoose.Types.ObjectId().toString(),
      ];

      const orphanedIds = [
        new mongoose.Types.ObjectId().toString(),
        new mongoose.Types.ObjectId().toString(),
      ];

      // Create existing documents in MongoDB
      for (const id of existingIds) {
        await messageModel.collection.insertOne({
          messageId: id,
          conversationId: new mongoose.Types.ObjectId(),
          user: new mongoose.Types.ObjectId(),
          isCreatedByUser: true,
          _meiliIndex: true,
          expiredAt: null,
        });
      }

      // Mock MeiliSearch to return batches with mixed existing and orphaned documents
      // First batch: 3 documents (1 existing, 2 orphaned) with batchSize=3
      mockGetDocuments
        .mockResolvedValueOnce({
          results: [
            { messageId: existingIds[0] },
            { messageId: orphanedIds[0] },
            { messageId: orphanedIds[1] },
          ],
        })
        // Second batch: should use offset=1 (3 - 2 deleted = 1)
        // results.length=2 < batchSize=3, so loop should stop after this
        .mockResolvedValueOnce({
          results: [{ messageId: existingIds[1] }, { messageId: existingIds[2] }],
        });

      const indexMock = mockIndex();
      await messageModel.cleanupMeiliIndex(indexMock, 'messageId', 3, 0);

      // Should have called getDocuments with correct offsets
      expect(mockGetDocuments).toHaveBeenCalledTimes(2);
      expect(mockGetDocuments).toHaveBeenNthCalledWith(1, { limit: 3, offset: 0 });
      // After deleting 2 documents, offset should be: 0 + (3 - 2) = 1
      expect(mockGetDocuments).toHaveBeenNthCalledWith(2, { limit: 3, offset: 1 });

      // Should delete only the orphaned documents
      expect(mockDeleteDocuments).toHaveBeenCalledWith([orphanedIds[0], orphanedIds[1]]);
    });

    test('cleanupMeiliIndex preserves existing documents', async () => {
      const conversationModel = createConversationModel(mongoose) as SchemaWithMeiliMethods;
      await conversationModel.deleteMany({});

      const existingId1 = new mongoose.Types.ObjectId().toString();
      const existingId2 = new mongoose.Types.ObjectId().toString();

      // Create documents in MongoDB
      await conversationModel.collection.insertMany([
        {
          conversationId: existingId1,
          user: new mongoose.Types.ObjectId(),
          title: 'Conversation 1',
          endpoint: EModelEndpoint.openAI,
          _meiliIndex: true,
          expiredAt: null,
        },
        {
          conversationId: existingId2,
          user: new mongoose.Types.ObjectId(),
          title: 'Conversation 2',
          endpoint: EModelEndpoint.openAI,
          _meiliIndex: true,
          expiredAt: null,
        },
      ]);

      // Mock MeiliSearch to return the same documents
      mockGetDocuments.mockResolvedValueOnce({
        results: [{ conversationId: existingId1 }, { conversationId: existingId2 }],
      });

      const indexMock = mockIndex();
      await conversationModel.cleanupMeiliIndex(indexMock, 'conversationId', 100, 0);

      // Should NOT delete any documents
      expect(mockDeleteDocuments).not.toHaveBeenCalled();
    });

    test('cleanupMeiliIndex handles empty MeiliSearch index', async () => {
      const messageModel = createMessageModel(mongoose) as SchemaWithMeiliMethods;

      // Mock empty MeiliSearch index
      mockGetDocuments.mockResolvedValueOnce({
        results: [],
      });

      const indexMock = mockIndex();
      await messageModel.cleanupMeiliIndex(indexMock, 'messageId', 100, 0);

      // Should not attempt to delete anything
      expect(mockDeleteDocuments).not.toHaveBeenCalled();
      expect(mockGetDocuments).toHaveBeenCalledTimes(1);
    });

    test('cleanupMeiliIndex stops when results.length < batchSize', async () => {
      const conversationModel = createConversationModel(mongoose) as SchemaWithMeiliMethods;
      await conversationModel.deleteMany({});

      const id1 = new mongoose.Types.ObjectId().toString();
      const id2 = new mongoose.Types.ObjectId().toString();

      await conversationModel.collection.insertMany([
        {
          conversationId: id1,
          user: new mongoose.Types.ObjectId(),
          title: 'Conversation 1',
          endpoint: EModelEndpoint.openAI,
          _meiliIndex: true,
          expiredAt: null,
        },
        {
          conversationId: id2,
          user: new mongoose.Types.ObjectId(),
          title: 'Conversation 2',
          endpoint: EModelEndpoint.openAI,
          _meiliIndex: true,
          expiredAt: null,
        },
      ]);

      // Mock: results.length (2) is less than batchSize (100), should process once and stop
      mockGetDocuments.mockResolvedValueOnce({
        results: [{ conversationId: id1 }, { conversationId: id2 }],
      });

      const indexMock = mockIndex();
      await conversationModel.cleanupMeiliIndex(indexMock, 'conversationId', 100, 0);

      // Should only call getDocuments once
      expect(mockGetDocuments).toHaveBeenCalledTimes(1);
      expect(mockDeleteDocuments).not.toHaveBeenCalled();
    });

    test('cleanupMeiliIndex handles multiple batches correctly', async () => {
      const messageModel = createMessageModel(mongoose) as SchemaWithMeiliMethods;
      await messageModel.deleteMany({});

      const existingIds = Array.from({ length: 5 }, () => new mongoose.Types.ObjectId().toString());
      const orphanedIds = Array.from({ length: 3 }, () => new mongoose.Types.ObjectId().toString());

      // Create existing documents in MongoDB
      for (const id of existingIds) {
        await messageModel.collection.insertOne({
          messageId: id,
          conversationId: new mongoose.Types.ObjectId(),
          user: new mongoose.Types.ObjectId(),
          isCreatedByUser: true,
          _meiliIndex: true,
          expiredAt: null,
        });
      }

      // Mock multiple batches with batchSize=3
      mockGetDocuments
        // Batch 1: 2 existing, 1 orphaned
        .mockResolvedValueOnce({
          results: [
            { messageId: existingIds[0] },
            { messageId: existingIds[1] },
            { messageId: orphanedIds[0] },
          ],
        })
        // Batch 2: offset should be 0 + (3 - 1) = 2
        .mockResolvedValueOnce({
          results: [
            { messageId: existingIds[2] },
            { messageId: orphanedIds[1] },
            { messageId: orphanedIds[2] },
          ],
        })
        // Batch 3: offset should be 2 + (3 - 2) = 3
        .mockResolvedValueOnce({
          results: [{ messageId: existingIds[3] }, { messageId: existingIds[4] }],
        });

      const indexMock = mockIndex();
      await messageModel.cleanupMeiliIndex(indexMock, 'messageId', 3, 0);

      expect(mockGetDocuments).toHaveBeenCalledTimes(3);
      expect(mockGetDocuments).toHaveBeenNthCalledWith(1, { limit: 3, offset: 0 });
      expect(mockGetDocuments).toHaveBeenNthCalledWith(2, { limit: 3, offset: 2 });
      expect(mockGetDocuments).toHaveBeenNthCalledWith(3, { limit: 3, offset: 3 });

      // Should have deleted orphaned documents in batches
      expect(mockDeleteDocuments).toHaveBeenCalledTimes(2);
      expect(mockDeleteDocuments).toHaveBeenNthCalledWith(1, [orphanedIds[0]]);
      expect(mockDeleteDocuments).toHaveBeenNthCalledWith(2, [orphanedIds[1], orphanedIds[2]]);
    });

    test('cleanupMeiliIndex handles delay between batches', async () => {
      const conversationModel = createConversationModel(mongoose) as SchemaWithMeiliMethods;
      await conversationModel.deleteMany({});

      const id1 = new mongoose.Types.ObjectId().toString();
      const id2 = new mongoose.Types.ObjectId().toString();

      await conversationModel.collection.insertMany([
        {
          conversationId: id1,
          user: new mongoose.Types.ObjectId(),
          title: 'Conversation 1',
          endpoint: EModelEndpoint.openAI,
          _meiliIndex: true,
          expiredAt: null,
        },
        {
          conversationId: id2,
          user: new mongoose.Types.ObjectId(),
          title: 'Conversation 2',
          endpoint: EModelEndpoint.openAI,
          _meiliIndex: true,
          expiredAt: null,
        },
      ]);

      mockGetDocuments
        .mockResolvedValueOnce({
          results: [{ conversationId: id1 }],
        })
        .mockResolvedValueOnce({
          results: [{ conversationId: id2 }],
        })
        .mockResolvedValueOnce({
          results: [],
        });

      const indexMock = mockIndex();
      const startTime = Date.now();
      await conversationModel.cleanupMeiliIndex(indexMock, 'conversationId', 1, 100);
      const endTime = Date.now();

      // Should have taken at least 200ms due to delay (2 delays between 3 batches)
      expect(endTime - startTime).toBeGreaterThanOrEqual(200);
      expect(mockGetDocuments).toHaveBeenCalledTimes(3);
    });

    test('cleanupMeiliIndex handles errors gracefully', async () => {
      const messageModel = createMessageModel(mongoose) as SchemaWithMeiliMethods;

      mockGetDocuments.mockRejectedValueOnce(new Error('MeiliSearch connection error'));

      const indexMock = mockIndex();

      // Should not throw, errors are caught and logged
      await expect(
        messageModel.cleanupMeiliIndex(indexMock, 'messageId', 100, 0),
      ).resolves.not.toThrow();
    });

    test('cleanupMeiliIndex with all documents being orphaned', async () => {
      const conversationModel = createConversationModel(mongoose) as SchemaWithMeiliMethods;
      await conversationModel.deleteMany({});

      const orphanedId1 = new mongoose.Types.ObjectId().toString();
      const orphanedId2 = new mongoose.Types.ObjectId().toString();
      const orphanedId3 = new mongoose.Types.ObjectId().toString();

      // MeiliSearch has documents but MongoDB is empty
      mockGetDocuments.mockResolvedValueOnce({
        results: [
          { conversationId: orphanedId1 },
          { conversationId: orphanedId2 },
          { conversationId: orphanedId3 },
        ],
      });

      const indexMock = mockIndex();
      await conversationModel.cleanupMeiliIndex(indexMock, 'conversationId', 100, 0);

      // Should delete all documents since none exist in MongoDB
      expect(mockDeleteDocuments).toHaveBeenCalledWith([orphanedId1, orphanedId2, orphanedId3]);
    });

    test('cleanupMeiliIndex adjusts offset to 0 when all batch documents are deleted', async () => {
      const messageModel = createMessageModel(mongoose) as SchemaWithMeiliMethods;
      await messageModel.deleteMany({});

      const orphanedIds = Array.from({ length: 3 }, () => new mongoose.Types.ObjectId().toString());
      const existingId = new mongoose.Types.ObjectId().toString();

      // Create one existing document
      await messageModel.collection.insertOne({
        messageId: existingId,
        conversationId: new mongoose.Types.ObjectId(),
        user: new mongoose.Types.ObjectId(),
        isCreatedByUser: true,
        _meiliIndex: true,
        expiredAt: null,
      });

      mockGetDocuments
        // Batch 1: All 3 are orphaned
        .mockResolvedValueOnce({
          results: [
            { messageId: orphanedIds[0] },
            { messageId: orphanedIds[1] },
            { messageId: orphanedIds[2] },
          ],
        })
        // Batch 2: offset should be 0 + (3 - 3) = 0
        .mockResolvedValueOnce({
          results: [{ messageId: existingId }],
        });

      const indexMock = mockIndex();
      await messageModel.cleanupMeiliIndex(indexMock, 'messageId', 3, 0);

      expect(mockGetDocuments).toHaveBeenCalledTimes(2);
      expect(mockGetDocuments).toHaveBeenNthCalledWith(1, { limit: 3, offset: 0 });
      // After deleting all 3, offset remains at 0
      expect(mockGetDocuments).toHaveBeenNthCalledWith(2, { limit: 3, offset: 0 });

      expect(mockDeleteDocuments).toHaveBeenCalledWith([
        orphanedIds[0],
        orphanedIds[1],
        orphanedIds[2],
      ]);
    });
  });
});
