import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { EToolResources, FileContext } from 'librechat-data-provider';
import { createFileMethods } from './file';
import { createModels } from '~/models';

let File: mongoose.Model<unknown>;
let fileMethods: ReturnType<typeof createFileMethods>;
let mongoServer: MongoMemoryServer;
let modelsToCleanup: string[] = [];

describe('File Methods', () => {
  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);

    const models = createModels(mongoose);
    modelsToCleanup = Object.keys(models);
    Object.assign(mongoose.models, models);

    File = mongoose.models.File as mongoose.Model<unknown>;
    fileMethods = createFileMethods(mongoose);
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
    await File.deleteMany({});
  });

  describe('createFile', () => {
    it('should create a new file with TTL', async () => {
      const fileId = uuidv4();
      const userId = new mongoose.Types.ObjectId();

      const file = await fileMethods.createFile({
        file_id: fileId,
        user: userId,
        filename: 'test.txt',
        filepath: '/uploads/test.txt',
        type: 'text/plain',
        bytes: 100,
      });

      expect(file).not.toBeNull();
      expect(file?.file_id).toBe(fileId);
      expect(file?.filename).toBe('test.txt');
      expect(file?.expiresAt).toBeDefined();
    });

    it('should create a file without TTL when disableTTL is true', async () => {
      const fileId = uuidv4();
      const userId = new mongoose.Types.ObjectId();

      const file = await fileMethods.createFile(
        {
          file_id: fileId,
          user: userId,
          filename: 'permanent.txt',
          filepath: '/uploads/permanent.txt',
          type: 'text/plain',
          bytes: 200,
        },
        true,
      );

      expect(file).not.toBeNull();
      expect(file?.file_id).toBe(fileId);
      expect(file?.expiresAt).toBeUndefined();
    });
  });

  describe('findFileById', () => {
    it('should find a file by file_id', async () => {
      const fileId = uuidv4();
      const userId = new mongoose.Types.ObjectId();

      await fileMethods.createFile({
        file_id: fileId,
        user: userId,
        filename: 'find-me.txt',
        filepath: '/uploads/find-me.txt',
        type: 'text/plain',
        bytes: 150,
      });

      const found = await fileMethods.findFileById(fileId);
      expect(found).not.toBeNull();
      expect(found?.file_id).toBe(fileId);
      expect(found?.filename).toBe('find-me.txt');
    });

    it('should return null for non-existent file', async () => {
      const found = await fileMethods.findFileById('non-existent');
      expect(found).toBeNull();
    });
  });

  describe('getFiles', () => {
    it('should retrieve multiple files matching filter', async () => {
      const userId = new mongoose.Types.ObjectId();
      const fileIds = [uuidv4(), uuidv4(), uuidv4()];

      for (const fileId of fileIds) {
        await fileMethods.createFile({
          file_id: fileId,
          user: userId,
          filename: `file-${fileId}.txt`,
          filepath: `/uploads/${fileId}.txt`,
          type: 'text/plain',
          bytes: 100,
        });
      }

      const files = await fileMethods.getFiles({ user: userId });
      expect(files).toHaveLength(3);
      expect(files.map((f) => f.file_id)).toEqual(expect.arrayContaining(fileIds));
    });

    it('should exclude text field by default', async () => {
      const fileId = uuidv4();
      const userId = new mongoose.Types.ObjectId();

      await fileMethods.createFile({
        file_id: fileId,
        user: userId,
        filename: 'with-text.txt',
        filepath: '/uploads/with-text.txt',
        type: 'text/plain',
        bytes: 100,
        text: 'Some content here',
      });

      const files = await fileMethods.getFiles({ file_id: fileId });
      expect(files).toHaveLength(1);
      expect(files[0].text).toBeUndefined();
    });
  });

  describe('getToolFilesByIds', () => {
    it('should retrieve files for file_search tool (embedded files)', async () => {
      const userId = new mongoose.Types.ObjectId();
      const embeddedFileId = uuidv4();
      const regularFileId = uuidv4();

      await fileMethods.createFile({
        file_id: embeddedFileId,
        user: userId,
        filename: 'embedded.txt',
        filepath: '/uploads/embedded.txt',
        type: 'text/plain',
        bytes: 100,
        embedded: true,
      });

      await fileMethods.createFile({
        file_id: regularFileId,
        user: userId,
        filename: 'regular.txt',
        filepath: '/uploads/regular.txt',
        type: 'text/plain',
        bytes: 100,
      });

      const toolSet = new Set([EToolResources.file_search]);
      const files = await fileMethods.getToolFilesByIds([embeddedFileId, regularFileId], toolSet);

      expect(files).toHaveLength(1);
      expect(files[0].file_id).toBe(embeddedFileId);
    });

    it('should retrieve files for context tool', async () => {
      const userId = new mongoose.Types.ObjectId();
      const contextFileId = uuidv4();

      await fileMethods.createFile({
        file_id: contextFileId,
        user: userId,
        filename: 'context.txt',
        filepath: '/uploads/context.txt',
        type: 'text/plain',
        bytes: 100,
        text: 'Context content',
        context: FileContext.agents,
      });

      const toolSet = new Set([EToolResources.context]);
      const files = await fileMethods.getToolFilesByIds([contextFileId], toolSet);

      expect(files).toHaveLength(1);
      expect(files[0].file_id).toBe(contextFileId);
    });

    it('should retrieve files for execute_code tool', async () => {
      const userId = new mongoose.Types.ObjectId();
      const codeFileId = uuidv4();

      await fileMethods.createFile({
        file_id: codeFileId,
        user: userId,
        filename: 'code.py',
        filepath: '/uploads/code.py',
        type: 'text/x-python',
        bytes: 100,
        metadata: { fileIdentifier: 'some-identifier' },
      });

      const toolSet = new Set([EToolResources.execute_code]);
      const files = await fileMethods.getToolFilesByIds([codeFileId], toolSet);

      expect(files).toHaveLength(1);
      expect(files[0].file_id).toBe(codeFileId);
    });
  });

  describe('updateFile', () => {
    it('should update file data and remove TTL', async () => {
      const fileId = uuidv4();
      const userId = new mongoose.Types.ObjectId();

      await fileMethods.createFile({
        file_id: fileId,
        user: userId,
        filename: 'original.txt',
        filepath: '/uploads/original.txt',
        type: 'text/plain',
        bytes: 100,
      });

      const updated = await fileMethods.updateFile({
        file_id: fileId,
        filename: 'updated.txt',
        bytes: 200,
      });

      expect(updated).not.toBeNull();
      expect(updated?.filename).toBe('updated.txt');
      expect(updated?.bytes).toBe(200);
      expect(updated?.expiresAt).toBeUndefined();
    });
  });

  describe('updateFileUsage', () => {
    it('should increment usage count', async () => {
      const fileId = uuidv4();
      const userId = new mongoose.Types.ObjectId();

      await fileMethods.createFile({
        file_id: fileId,
        user: userId,
        filename: 'usage-test.txt',
        filepath: '/uploads/usage-test.txt',
        type: 'text/plain',
        bytes: 100,
        usage: 0,
      });

      const updated = await fileMethods.updateFileUsage({ file_id: fileId });
      expect(updated?.usage).toBe(1);

      const updated2 = await fileMethods.updateFileUsage({ file_id: fileId, inc: 5 });
      expect(updated2?.usage).toBe(6);
    });
  });

  describe('updateFilesUsage', () => {
    it('should update usage for multiple files', async () => {
      const userId = new mongoose.Types.ObjectId();
      const fileIds = [uuidv4(), uuidv4()];

      for (const fileId of fileIds) {
        await fileMethods.createFile({
          file_id: fileId,
          user: userId,
          filename: `file-${fileId}.txt`,
          filepath: `/uploads/${fileId}.txt`,
          type: 'text/plain',
          bytes: 100,
          usage: 0,
        });
      }

      const files = fileIds.map((file_id) => ({ file_id }));
      const updated = await fileMethods.updateFilesUsage(files);

      expect(updated).toHaveLength(2);
      for (const file of updated) {
        expect((file as { usage: number }).usage).toBe(1);
      }
    });

    it('should deduplicate files', async () => {
      const userId = new mongoose.Types.ObjectId();
      const fileId = uuidv4();

      await fileMethods.createFile({
        file_id: fileId,
        user: userId,
        filename: 'duplicate-test.txt',
        filepath: '/uploads/duplicate-test.txt',
        type: 'text/plain',
        bytes: 100,
        usage: 0,
      });

      const files = [{ file_id: fileId }, { file_id: fileId }, { file_id: fileId }];
      const updated = await fileMethods.updateFilesUsage(files);

      expect(updated).toHaveLength(1);
      expect((updated[0] as { usage: number }).usage).toBe(1);
    });

    it('should filter out null results when files do not exist', async () => {
      const userId = new mongoose.Types.ObjectId();
      const existingFileId = uuidv4();

      await fileMethods.createFile({
        file_id: existingFileId,
        user: userId,
        filename: 'existing.txt',
        filepath: '/uploads/existing.txt',
        type: 'text/plain',
        bytes: 100,
        usage: 0,
      });

      const files = [{ file_id: existingFileId }, { file_id: 'non-existent-file' }];
      const updated = await fileMethods.updateFilesUsage(files);

      expect(updated.length).toBeGreaterThan(0);
      expect(updated).not.toContain(null);
      expect(updated).not.toContain(undefined);
      const existingFile = updated.find(
        (f) => (f as { file_id: string }).file_id === existingFileId,
      );
      expect(existingFile).toBeDefined();
      expect((existingFile as { usage: number }).usage).toBe(1);
    });

    it('should handle empty files array', async () => {
      const result = await fileMethods.updateFilesUsage([]);
      expect(result).toEqual([]);
    });

    it('should handle fileIds parameter', async () => {
      const userId = new mongoose.Types.ObjectId();
      const fileIds = [uuidv4(), uuidv4()];

      for (const fileId of fileIds) {
        await fileMethods.createFile({
          file_id: fileId,
          user: userId,
          filename: `file-${fileId}.txt`,
          filepath: `/uploads/${fileId}.txt`,
          type: 'text/plain',
          bytes: 100,
          usage: 0,
        });
      }

      const files = [{ file_id: fileIds[0] }];
      const updated = await fileMethods.updateFilesUsage(files, [fileIds[1]]);

      expect(updated).toHaveLength(2);
      const file1 = updated.find((f) => (f as { file_id: string }).file_id === fileIds[0]);
      const file2 = updated.find((f) => (f as { file_id: string }).file_id === fileIds[1]);
      expect(file1).toBeDefined();
      expect(file2).toBeDefined();
      expect((file1 as { usage: number }).usage).toBe(1);
      expect((file2 as { usage: number }).usage).toBe(1);
    });

    it('should deduplicate between files and fileIds parameters', async () => {
      const userId = new mongoose.Types.ObjectId();
      const fileId = uuidv4();

      await fileMethods.createFile({
        file_id: fileId,
        user: userId,
        filename: 'test.txt',
        filepath: '/uploads/test.txt',
        type: 'text/plain',
        bytes: 100,
        usage: 0,
      });

      const files = [{ file_id: fileId }];
      const updated = await fileMethods.updateFilesUsage(files, [fileId]);

      expect(updated).toHaveLength(1);
      expect((updated[0] as { usage: number }).usage).toBe(1);
    });
  });

  describe('deleteFile', () => {
    it('should delete a file by file_id', async () => {
      const fileId = uuidv4();
      const userId = new mongoose.Types.ObjectId();

      await fileMethods.createFile({
        file_id: fileId,
        user: userId,
        filename: 'delete-me.txt',
        filepath: '/uploads/delete-me.txt',
        type: 'text/plain',
        bytes: 100,
      });

      const deleted = await fileMethods.deleteFile(fileId);
      expect(deleted).not.toBeNull();
      expect(deleted?.file_id).toBe(fileId);

      const found = await fileMethods.findFileById(fileId);
      expect(found).toBeNull();
    });
  });

  describe('deleteFiles', () => {
    it('should delete multiple files by file_ids', async () => {
      const userId = new mongoose.Types.ObjectId();
      const fileIds = [uuidv4(), uuidv4(), uuidv4()];

      for (const fileId of fileIds) {
        await fileMethods.createFile({
          file_id: fileId,
          user: userId,
          filename: `file-${fileId}.txt`,
          filepath: `/uploads/${fileId}.txt`,
          type: 'text/plain',
          bytes: 100,
        });
      }

      const result = await fileMethods.deleteFiles(fileIds);
      expect(result.deletedCount).toBe(3);

      const remaining = await fileMethods.getFiles({ file_id: { $in: fileIds } });
      expect(remaining).toHaveLength(0);
    });

    it('should delete all files for a user', async () => {
      const userId = new mongoose.Types.ObjectId();
      const otherUserId = new mongoose.Types.ObjectId();

      await fileMethods.createFile({
        file_id: uuidv4(),
        user: userId,
        filename: 'user-file-1.txt',
        filepath: '/uploads/user-file-1.txt',
        type: 'text/plain',
        bytes: 100,
      });

      await fileMethods.createFile({
        file_id: uuidv4(),
        user: userId,
        filename: 'user-file-2.txt',
        filepath: '/uploads/user-file-2.txt',
        type: 'text/plain',
        bytes: 100,
      });

      await fileMethods.createFile({
        file_id: uuidv4(),
        user: otherUserId,
        filename: 'other-user-file.txt',
        filepath: '/uploads/other-user-file.txt',
        type: 'text/plain',
        bytes: 100,
      });

      const result = await fileMethods.deleteFiles([], userId.toString());
      expect(result.deletedCount).toBe(2);

      const remaining = await fileMethods.getFiles({});
      expect(remaining).toHaveLength(1);
      expect(remaining[0].user?.toString()).toBe(otherUserId.toString());
    });
  });

  describe('batchUpdateFiles', () => {
    it('should update multiple file paths', async () => {
      const userId = new mongoose.Types.ObjectId();
      const fileIds = [uuidv4(), uuidv4()];

      for (const fileId of fileIds) {
        await fileMethods.createFile({
          file_id: fileId,
          user: userId,
          filename: `file-${fileId}.txt`,
          filepath: `/old-path/${fileId}.txt`,
          type: 'text/plain',
          bytes: 100,
        });
      }

      const updates = fileIds.map((file_id) => ({
        file_id,
        filepath: `/new-path/${file_id}.txt`,
      }));

      await fileMethods.batchUpdateFiles(updates);

      for (const fileId of fileIds) {
        const file = await fileMethods.findFileById(fileId);
        expect(file?.filepath).toBe(`/new-path/${fileId}.txt`);
      }
    });

    it('should handle empty updates array gracefully', async () => {
      await expect(fileMethods.batchUpdateFiles([])).resolves.toBeUndefined();
    });
  });
});
