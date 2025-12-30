const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { batchResetMeiliFlags } = require('./utils');

describe('batchResetMeiliFlags', () => {
  let mongoServer;
  let testCollection;
  const ORIGINAL_BATCH_SIZE = process.env.MEILI_SYNC_BATCH_SIZE;
  const ORIGINAL_BATCH_DELAY = process.env.MEILI_SYNC_DELAY_MS;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();

    // Restore original env variables
    if (ORIGINAL_BATCH_SIZE !== undefined) {
      process.env.MEILI_SYNC_BATCH_SIZE = ORIGINAL_BATCH_SIZE;
    } else {
      delete process.env.MEILI_SYNC_BATCH_SIZE;
    }

    if (ORIGINAL_BATCH_DELAY !== undefined) {
      process.env.MEILI_SYNC_DELAY_MS = ORIGINAL_BATCH_DELAY;
    } else {
      delete process.env.MEILI_SYNC_DELAY_MS;
    }
  });

  beforeEach(async () => {
    // Create a fresh collection for each test
    testCollection = mongoose.connection.db.collection('test_meili_batch');
    await testCollection.deleteMany({});

    // Reset env variables to defaults
    delete process.env.MEILI_SYNC_BATCH_SIZE;
    delete process.env.MEILI_SYNC_DELAY_MS;
  });

  afterEach(async () => {
    if (testCollection) {
      await testCollection.deleteMany({});
    }
  });

  describe('basic functionality', () => {
    it('should reset _meiliIndex flag for documents with expiredAt: null and _meiliIndex: true', async () => {
      // Insert test documents
      await testCollection.insertMany([
        { _id: new mongoose.Types.ObjectId(), expiredAt: null, _meiliIndex: true, name: 'doc1' },
        { _id: new mongoose.Types.ObjectId(), expiredAt: null, _meiliIndex: true, name: 'doc2' },
        { _id: new mongoose.Types.ObjectId(), expiredAt: null, _meiliIndex: true, name: 'doc3' },
      ]);

      const result = await batchResetMeiliFlags(testCollection);

      expect(result).toBe(3);

      const updatedDocs = await testCollection.find({ _meiliIndex: false }).toArray();
      expect(updatedDocs).toHaveLength(3);

      const notUpdatedDocs = await testCollection.find({ _meiliIndex: true }).toArray();
      expect(notUpdatedDocs).toHaveLength(0);
    });

    it('should not modify documents with expiredAt set', async () => {
      const expiredDate = new Date();
      await testCollection.insertMany([
        { _id: new mongoose.Types.ObjectId(), expiredAt: expiredDate, _meiliIndex: true },
        { _id: new mongoose.Types.ObjectId(), expiredAt: null, _meiliIndex: true },
      ]);

      const result = await batchResetMeiliFlags(testCollection);

      expect(result).toBe(1);

      const expiredDoc = await testCollection.findOne({ expiredAt: expiredDate });
      expect(expiredDoc._meiliIndex).toBe(true);
    });

    it('should not modify documents with _meiliIndex: false', async () => {
      await testCollection.insertMany([
        { _id: new mongoose.Types.ObjectId(), expiredAt: null, _meiliIndex: false },
        { _id: new mongoose.Types.ObjectId(), expiredAt: null, _meiliIndex: true },
      ]);

      const result = await batchResetMeiliFlags(testCollection);

      expect(result).toBe(1);
    });

    it('should return 0 when no documents match the criteria', async () => {
      await testCollection.insertMany([
        { _id: new mongoose.Types.ObjectId(), expiredAt: new Date(), _meiliIndex: true },
        { _id: new mongoose.Types.ObjectId(), expiredAt: null, _meiliIndex: false },
      ]);

      const result = await batchResetMeiliFlags(testCollection);

      expect(result).toBe(0);
    });

    it('should return 0 when collection is empty', async () => {
      const result = await batchResetMeiliFlags(testCollection);

      expect(result).toBe(0);
    });
  });

  describe('batch processing', () => {
    it('should process documents in batches according to MEILI_SYNC_BATCH_SIZE', async () => {
      process.env.MEILI_SYNC_BATCH_SIZE = '2';

      const docs = [];
      for (let i = 0; i < 5; i++) {
        docs.push({
          _id: new mongoose.Types.ObjectId(),
          expiredAt: null,
          _meiliIndex: true,
          name: `doc${i}`,
        });
      }
      await testCollection.insertMany(docs);

      const result = await batchResetMeiliFlags(testCollection);

      expect(result).toBe(5);

      const updatedDocs = await testCollection.find({ _meiliIndex: false }).toArray();
      expect(updatedDocs).toHaveLength(5);
    });

    it('should handle large datasets with small batch sizes', async () => {
      process.env.MEILI_SYNC_BATCH_SIZE = '10';

      const docs = [];
      for (let i = 0; i < 25; i++) {
        docs.push({
          _id: new mongoose.Types.ObjectId(),
          expiredAt: null,
          _meiliIndex: true,
        });
      }
      await testCollection.insertMany(docs);

      const result = await batchResetMeiliFlags(testCollection);

      expect(result).toBe(25);
    });

    it('should use default batch size of 1000 when env variable is not set', async () => {
      // Create exactly 1000 documents to verify default batch behavior
      const docs = [];
      for (let i = 0; i < 1000; i++) {
        docs.push({
          _id: new mongoose.Types.ObjectId(),
          expiredAt: null,
          _meiliIndex: true,
        });
      }
      await testCollection.insertMany(docs);

      const result = await batchResetMeiliFlags(testCollection);

      expect(result).toBe(1000);
    });
  });

  describe('progress callback', () => {
    it('should call onProgress callback with correct parameters', async () => {
      const onProgress = jest.fn();
      const collectionName = 'test_collection';

      await testCollection.insertMany([
        { _id: new mongoose.Types.ObjectId(), expiredAt: null, _meiliIndex: true },
        { _id: new mongoose.Types.ObjectId(), expiredAt: null, _meiliIndex: true },
        { _id: new mongoose.Types.ObjectId(), expiredAt: null, _meiliIndex: true },
      ]);

      await batchResetMeiliFlags(testCollection, { onProgress, collectionName });

      expect(onProgress).toHaveBeenCalled();
      expect(onProgress).toHaveBeenCalledWith(3, collectionName);
    });

    it('should call onProgress multiple times for batched operations', async () => {
      process.env.MEILI_SYNC_BATCH_SIZE = '2';
      const onProgress = jest.fn();
      const collectionName = 'test_collection';

      // Need to clear the require cache to force re-reading env vars
      // or the function will use the cached values
      const docs = [];
      for (let i = 0; i < 5; i++) {
        docs.push({
          _id: new mongoose.Types.ObjectId(),
          expiredAt: null,
          _meiliIndex: true,
        });
      }
      await testCollection.insertMany(docs);

      await batchResetMeiliFlags(testCollection, { onProgress, collectionName });

      // Should be called 3 times: after batch 1 (2), batch 2 (4), batch 3 (5)
      expect(onProgress).toHaveBeenCalledTimes(3);
      expect(onProgress).toHaveBeenNthCalledWith(1, 2, collectionName);
      expect(onProgress).toHaveBeenNthCalledWith(2, 4, collectionName);
      expect(onProgress).toHaveBeenNthCalledWith(3, 5, collectionName);
    });

    it('should work without onProgress callback', async () => {
      await testCollection.insertMany([
        { _id: new mongoose.Types.ObjectId(), expiredAt: null, _meiliIndex: true },
      ]);

      await expect(batchResetMeiliFlags(testCollection)).resolves.toBe(1);
    });

    it('should work with empty options object', async () => {
      await testCollection.insertMany([
        { _id: new mongoose.Types.ObjectId(), expiredAt: null, _meiliIndex: true },
      ]);

      await expect(batchResetMeiliFlags(testCollection, {})).resolves.toBe(1);
    });
  });

  describe('batch delay', () => {
    it('should respect MEILI_SYNC_DELAY_MS between batches', async () => {
      process.env.MEILI_SYNC_BATCH_SIZE = '2';
      process.env.MEILI_SYNC_DELAY_MS = '50';

      const docs = [];
      for (let i = 0; i < 5; i++) {
        docs.push({
          _id: new mongoose.Types.ObjectId(),
          expiredAt: null,
          _meiliIndex: true,
        });
      }
      await testCollection.insertMany(docs);

      const startTime = Date.now();
      await batchResetMeiliFlags(testCollection);
      const endTime = Date.now();

      // With 5 documents and batch size 2, we need 3 batches
      // That means 2 delays between batches (not after the last one)
      // So minimum time should be around 100ms (2 * 50ms)
      // Using a slightly lower threshold to account for timing variations
      const elapsed = endTime - startTime;
      expect(elapsed).toBeGreaterThanOrEqual(80);
    });

    it('should not delay when MEILI_SYNC_DELAY_MS is 0', async () => {
      process.env.MEILI_SYNC_BATCH_SIZE = '2';
      process.env.MEILI_SYNC_DELAY_MS = '0';

      const docs = [];
      for (let i = 0; i < 5; i++) {
        docs.push({
          _id: new mongoose.Types.ObjectId(),
          expiredAt: null,
          _meiliIndex: true,
        });
      }
      await testCollection.insertMany(docs);

      const startTime = Date.now();
      await batchResetMeiliFlags(testCollection);
      const endTime = Date.now();

      const elapsed = endTime - startTime;
      // Should complete without intentional delays, but database operations still take time
      // Just verify it completes and returns the correct count
      expect(elapsed).toBeLessThan(1000); // More reasonable upper bound

      const result = await testCollection.countDocuments({ _meiliIndex: false });
      expect(result).toBe(5);
    });

    it('should not delay after the last batch', async () => {
      process.env.MEILI_SYNC_BATCH_SIZE = '3';
      process.env.MEILI_SYNC_DELAY_MS = '100';

      // Exactly 3 documents - should fit in one batch, no delay
      await testCollection.insertMany([
        { _id: new mongoose.Types.ObjectId(), expiredAt: null, _meiliIndex: true },
        { _id: new mongoose.Types.ObjectId(), expiredAt: null, _meiliIndex: true },
        { _id: new mongoose.Types.ObjectId(), expiredAt: null, _meiliIndex: true },
      ]);

      const result = await batchResetMeiliFlags(testCollection);

      // Verify all 3 documents were processed in a single batch
      expect(result).toBe(3);

      const updatedDocs = await testCollection.countDocuments({ _meiliIndex: false });
      expect(updatedDocs).toBe(3);
    });
  });

  describe('edge cases', () => {
    it('should handle documents without _meiliIndex field', async () => {
      await testCollection.insertMany([
        { _id: new mongoose.Types.ObjectId(), expiredAt: null },
        { _id: new mongoose.Types.ObjectId(), expiredAt: null, _meiliIndex: true },
      ]);

      const result = await batchResetMeiliFlags(testCollection);

      // Only one document has _meiliIndex: true
      expect(result).toBe(1);
    });

    it('should handle mixed document states correctly', async () => {
      await testCollection.insertMany([
        { _id: new mongoose.Types.ObjectId(), expiredAt: null, _meiliIndex: true },
        { _id: new mongoose.Types.ObjectId(), expiredAt: null, _meiliIndex: false },
        { _id: new mongoose.Types.ObjectId(), expiredAt: new Date(), _meiliIndex: true },
        { _id: new mongoose.Types.ObjectId(), expiredAt: null, _meiliIndex: true },
      ]);

      const result = await batchResetMeiliFlags(testCollection);

      expect(result).toBe(2);

      const flaggedDocs = await testCollection
        .find({ expiredAt: null, _meiliIndex: false })
        .toArray();
      expect(flaggedDocs).toHaveLength(3); // 2 were updated, 1 was already false
    });
  });
});
