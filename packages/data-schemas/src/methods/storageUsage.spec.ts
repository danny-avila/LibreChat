import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { FileContext } from 'librechat-data-provider';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createStorageUsageMethods } from './storageUsage';
import { createModels } from '~/models';

let mongoServer: MongoMemoryServer;
let models: ReturnType<typeof createModels>;
let methods: ReturnType<typeof createStorageUsageMethods>;

describe('Storage Usage Methods', () => {
  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
    models = createModels(mongoose);
    methods = createStorageUsageMethods(mongoose);
  });

  afterAll(async () => {
    for (const key of Object.keys(mongoose.connection.collections)) {
      await mongoose.connection.collections[key].deleteMany({});
    }
    for (const name of Object.keys(mongoose.models)) {
      delete mongoose.models[name];
    }
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await models.File.deleteMany({});
    await models.StorageUsage.deleteMany({});
  });

  const createTestFile = async (
    user: mongoose.Types.ObjectId,
    bytes: number,
    context: FileContext = FileContext.message_attachment,
  ) => {
    await models.File.create({
      file_id: uuidv4(),
      user,
      filename: `file-${bytes}.txt`,
      filepath: `/uploads/file-${bytes}.txt`,
      type: 'text/plain',
      bytes,
      context,
    });
  };

  describe('getStorageUsage', () => {
    it('returns 0 bytesUsed when user has no files and no override doc', async () => {
      const userId = new mongoose.Types.ObjectId();

      const result = await methods.getStorageUsage(userId.toString(), null);

      expect(result).toEqual({ bytesUsed: 0, bytesLimit: null });
    });

    it('sums bytes from all non-avatar files for the user', async () => {
      const userA = new mongoose.Types.ObjectId();
      const userB = new mongoose.Types.ObjectId();

      await createTestFile(userA, 100);
      await createTestFile(userA, 200);
      await createTestFile(userA, 500);
      await createTestFile(userB, 900);

      const result = await methods.getStorageUsage(userA.toString(), null);

      expect(result.bytesUsed).toBe(800);
    });

    it('excludes files with context: avatar from the sum', async () => {
      const userId = new mongoose.Types.ObjectId();

      await createTestFile(userId, 100, FileContext.message_attachment);
      await createTestFile(userId, 500, FileContext.avatar);

      const result = await methods.getStorageUsage(userId.toString(), null);

      expect(result.bytesUsed).toBe(100);
    });

    it('sums files across all non-avatar context types (message_attachment, assistants_output, image_generation, execute_code)', async () => {
      const userId = new mongoose.Types.ObjectId();

      await createTestFile(userId, 100, FileContext.message_attachment);
      await createTestFile(userId, 200, FileContext.assistants_output);
      await createTestFile(userId, 400, FileContext.image_generation);
      await createTestFile(userId, 800, FileContext.execute_code);

      const result = await methods.getStorageUsage(userId.toString(), null);

      expect(result.bytesUsed).toBe(1500);
    });

    it('uses per-user bytesLimit override when present in storageusages', async () => {
      const userId = new mongoose.Types.ObjectId();

      await models.StorageUsage.create({ user: userId, bytesLimit: 5_000_000 });

      const result = await methods.getStorageUsage(userId.toString(), 10_000_000);

      expect(result.bytesLimit).toBe(5_000_000);
    });

    it('falls back to defaultLimit when no override doc exists', async () => {
      const userId = new mongoose.Types.ObjectId();

      const result = await methods.getStorageUsage(userId.toString(), 42);

      expect(result.bytesLimit).toBe(42);
    });

    it('returns bytesLimit: 0 when override is 0 (admin lockout)', async () => {
      const userId = new mongoose.Types.ObjectId();

      await models.StorageUsage.create({ user: userId, bytesLimit: 0 });

      const result = await methods.getStorageUsage(userId.toString(), 10_000_000);

      expect(result.bytesLimit).toBe(0);
    });

    it('falls back to defaultLimit when doc exists but bytesLimit is null', async () => {
      const userId = new mongoose.Types.ObjectId();

      await models.StorageUsage.create({ user: userId, bytesLimit: null });

      const result = await methods.getStorageUsage(userId.toString(), 42);

      expect(result.bytesLimit).toBe(42);
    });
  });

  describe('deleteStorageUsage', () => {
    it('removes the matching override doc and leaves usage aggregation unaffected', async () => {
      const userId = new mongoose.Types.ObjectId();
      await models.StorageUsage.create({ user: userId, bytesLimit: 7_777 });
      await createTestFile(userId, 500);

      await methods.deleteStorageUsage({ user: userId.toString() });

      const result = await methods.getStorageUsage(userId.toString(), 42);
      expect(result).toEqual({ bytesUsed: 500, bytesLimit: 42 });
    });

    it('is a no-op when no override doc exists', async () => {
      const userId = new mongoose.Types.ObjectId();

      await expect(
        methods.deleteStorageUsage({ user: userId.toString() }),
      ).resolves.toBeUndefined();
    });
  });
});
