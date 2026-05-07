import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { EToolResources, FileContext } from 'librechat-data-provider';
import { createFileMethods } from './file';
import { createModels } from '~/models';
import { runAsSystem } from '~/config/tenantContext';
import { _resetStrictCache } from '~/models/plugins/tenantIsolation';

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

  describe('claimCodeFile', () => {
    it('claims code output files independently per tenant', async () => {
      const userId = new mongoose.Types.ObjectId().toString();

      const tenantA = await fileMethods.claimCodeFile({
        filename: 'report.csv',
        conversationId: 'conversation-1',
        file_id: 'file-tenant-a',
        user: userId,
        tenantId: 'tenant-a',
      });
      const tenantB = await fileMethods.claimCodeFile({
        filename: 'report.csv',
        conversationId: 'conversation-1',
        file_id: 'file-tenant-b',
        user: userId,
        tenantId: 'tenant-b',
      });
      const tenantAAgain = await fileMethods.claimCodeFile({
        filename: 'report.csv',
        conversationId: 'conversation-1',
        file_id: 'file-tenant-a-new',
        user: userId,
        tenantId: 'tenant-a',
      });

      expect(tenantA.file_id).toBe('file-tenant-a');
      expect(tenantA.tenantId).toBe('tenant-a');
      expect(tenantB.file_id).toBe('file-tenant-b');
      expect(tenantB.tenantId).toBe('tenant-b');
      expect(tenantAAgain.file_id).toBe('file-tenant-a');
    });

    it('keeps non-tenant code output claims in the legacy namespace', async () => {
      const userId = new mongoose.Types.ObjectId().toString();

      const legacy = await fileMethods.claimCodeFile({
        filename: 'legacy.csv',
        conversationId: 'conversation-1',
        file_id: 'legacy-file',
        user: userId,
      });
      const tenant = await fileMethods.claimCodeFile({
        filename: 'legacy.csv',
        conversationId: 'conversation-1',
        file_id: 'tenant-file',
        user: userId,
        tenantId: 'tenant-a',
      });

      expect(legacy.file_id).toBe('legacy-file');
      expect(legacy.tenantId).toBeNull();
      expect(tenant.file_id).toBe('tenant-file');
      expect(tenant.tenantId).toBe('tenant-a');
    });

    it('treats null tenantId as the legacy code output namespace', async () => {
      const userId = new mongoose.Types.ObjectId().toString();

      const legacy = await fileMethods.claimCodeFile({
        filename: 'nullable-legacy.csv',
        conversationId: 'conversation-1',
        file_id: 'legacy-null-file',
        user: userId,
        tenantId: null,
      });
      const legacyAgain = await fileMethods.claimCodeFile({
        filename: 'nullable-legacy.csv',
        conversationId: 'conversation-1',
        file_id: 'legacy-null-file-new',
        user: userId,
      });

      expect(legacy.file_id).toBe('legacy-null-file');
      expect(legacyAgain.file_id).toBe('legacy-null-file');
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
      expect(files!.map((f) => f.file_id)).toEqual(expect.arrayContaining(fileIds));
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
      expect(files![0].text).toBeUndefined();
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

    it('should not retrieve execute_code files (handled by getCodeGeneratedFiles)', async () => {
      const userId = new mongoose.Types.ObjectId();
      const codeFileId = uuidv4();

      await fileMethods.createFile({
        file_id: codeFileId,
        user: userId,
        filename: 'code.py',
        filepath: '/uploads/code.py',
        type: 'text/x-python',
        bytes: 100,
        context: FileContext.execute_code,
        metadata: { fileIdentifier: 'some-identifier' },
      });

      // execute_code files are explicitly excluded from getToolFilesByIds
      // They are retrieved via getCodeGeneratedFiles and getUserCodeFiles instead
      const toolSet = new Set([EToolResources.execute_code]);
      const files = await fileMethods.getToolFilesByIds([codeFileId], toolSet);

      expect(files).toHaveLength(0);
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

    /* The optional `extraFilter` enables conditional updates — used by
     * the deferred-preview render's `finalizePreview` to guard against
     * an older render of the same `file_id` overwriting a newer turn's
     * record on cross-turn filename reuse. (Codex P1 review on PR
     * #12957.) */
    describe('extraFilter (conditional update)', () => {
      it('commits when the extra filter matches the current document', async () => {
        const fileId = uuidv4();
        const userId = new mongoose.Types.ObjectId();
        await fileMethods.createFile({
          file_id: fileId,
          user: userId,
          filename: 'data.xlsx',
          filepath: '/uploads/data.xlsx',
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          bytes: 100,
          status: 'pending',
          previewRevision: 'rev-A',
        });

        const updated = await fileMethods.updateFile(
          { file_id: fileId, status: 'ready', text: '<table></table>' },
          { previewRevision: 'rev-A' },
        );

        expect(updated).not.toBeNull();
        expect(updated?.status).toBe('ready');
        expect(updated?.text).toBe('<table></table>');
      });

      it('returns null and skips the write when the extra filter does NOT match', async () => {
        const fileId = uuidv4();
        const userId = new mongoose.Types.ObjectId();
        await fileMethods.createFile({
          file_id: fileId,
          user: userId,
          filename: 'data.xlsx',
          filepath: '/uploads/data.xlsx',
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          bytes: 100,
          status: 'pending',
          previewRevision: 'rev-B', // newer turn has rotated the revision
        });

        /* An older render that started while revision was 'rev-A' tries
         * to commit. The newer turn has since rotated to 'rev-B'. The
         * conditional update silently no-ops. */
        const updated = await fileMethods.updateFile(
          { file_id: fileId, status: 'ready', text: '<stale/>' },
          { previewRevision: 'rev-A' },
        );

        expect(updated).toBeNull();

        /* Critical: the newer record's text MUST be untouched. */
        const fresh = await fileMethods.findFileById(fileId);
        expect(fresh?.previewRevision).toBe('rev-B');
        expect(fresh?.status).toBe('pending');
        expect(fresh?.text).toBeUndefined();
      });

      it('falls back to single-key update when extraFilter is omitted (back-compat)', async () => {
        const fileId = uuidv4();
        const userId = new mongoose.Types.ObjectId();
        await fileMethods.createFile({
          file_id: fileId,
          user: userId,
          filename: 'plain.txt',
          filepath: '/uploads/plain.txt',
          type: 'text/plain',
          bytes: 50,
        });

        const updated = await fileMethods.updateFile({
          file_id: fileId,
          bytes: 99,
        });

        expect(updated).not.toBeNull();
        expect(updated?.bytes).toBe(99);
      });
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
      expect(remaining![0].user?.toString()).toBe(otherUserId.toString());
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

    it('should persist storage metadata when provided', async () => {
      const userId = new mongoose.Types.ObjectId();
      const fileId = uuidv4();

      await fileMethods.createFile({
        file_id: fileId,
        user: userId,
        filename: 'region-file.txt',
        filepath: '/old-path/file.txt',
        type: 'text/plain',
        bytes: 100,
      });

      await fileMethods.batchUpdateFiles([
        {
          file_id: fileId,
          filepath: '/new-path/file.txt',
          storageKey: 'i/r/us-east-2/images/user123/file.txt',
          storageRegion: 'us-east-2',
        },
      ]);

      const file = await fileMethods.findFileById(fileId);
      expect(file?.filepath).toBe('/new-path/file.txt');
      expect(file?.storageKey).toBe('i/r/us-east-2/images/user123/file.txt');
      expect(file?.storageRegion).toBe('us-east-2');
    });

    it('should not overwrite existing storage metadata when omitted', async () => {
      const userId = new mongoose.Types.ObjectId();
      const fileId = uuidv4();

      await fileMethods.createFile({
        file_id: fileId,
        user: userId,
        filename: 'existing-metadata.txt',
        filepath: '/old-path/file.txt',
        storageKey: 'r/eu-central-1/uploads/user123/file.txt',
        storageRegion: 'eu-central-1',
        type: 'text/plain',
        bytes: 100,
      });

      await fileMethods.batchUpdateFiles([
        {
          file_id: fileId,
          filepath: '/new-path/file.txt',
        },
      ]);

      const file = await fileMethods.findFileById(fileId);
      expect(file?.filepath).toBe('/new-path/file.txt');
      expect(file?.storageKey).toBe('r/eu-central-1/uploads/user123/file.txt');
      expect(file?.storageRegion).toBe('eu-central-1');
    });

    it('should handle empty updates array gracefully', async () => {
      await expect(fileMethods.batchUpdateFiles([])).resolves.toBeUndefined();
    });
  });

  describe('sweepOrphanedPreviews', () => {
    /* The deferred-preview flow runs the deferred render in-process. If the
     * backend restarts mid-extraction, records stay at `status: 'pending'`
     * forever. The boot-time sweep transitions stale ones to 'failed'
     * with `previewError: 'orphaned'` so the frontend stops polling. */
    const userId = new mongoose.Types.ObjectId();

    /**
     * Stamp a precise `updatedAt` on a file record. Mongoose timestamps
     * insist on the current time during create, so we backdate via a
     * direct collection write afterwards.
     */
    async function makeFile(opts: {
      ageMs: number;
      status?: 'pending' | 'ready' | 'failed';
    }): Promise<string> {
      const fileId = uuidv4();
      await fileMethods.createFile({
        file_id: fileId,
        user: userId,
        filename: `${fileId}.xlsx`,
        filepath: `/uploads/${fileId}.xlsx`,
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        bytes: 1024,
        ...(opts.status ? { status: opts.status } : {}),
      });
      const backdated = new Date(Date.now() - opts.ageMs);
      await File.collection.updateOne({ file_id: fileId }, { $set: { updatedAt: backdated } });
      return fileId;
    }

    it('marks stale pending records as failed with previewError:orphaned', async () => {
      const stale = await makeFile({ ageMs: 10 * 60 * 1000, status: 'pending' });
      const fresh = await makeFile({ ageMs: 30 * 1000, status: 'pending' });

      const count = await fileMethods.sweepOrphanedPreviews();
      expect(count).toBe(1);

      const staleAfter = (await fileMethods.findFileById(stale)) as {
        status?: string;
        previewError?: string;
      } | null;
      expect(staleAfter?.status).toBe('failed');
      expect(staleAfter?.previewError).toBe('orphaned');

      const freshAfter = (await fileMethods.findFileById(fresh)) as {
        status?: string;
      } | null;
      expect(freshAfter?.status).toBe('pending');
    });

    it('does not touch records that are already ready or failed (idempotent)', async () => {
      const ready = await makeFile({ ageMs: 60 * 60 * 1000, status: 'ready' });
      const failed = await makeFile({ ageMs: 60 * 60 * 1000, status: 'failed' });

      const count = await fileMethods.sweepOrphanedPreviews();
      expect(count).toBe(0);

      const readyAfter = (await fileMethods.findFileById(ready)) as { status?: string } | null;
      const failedAfter = (await fileMethods.findFileById(failed)) as { status?: string } | null;
      expect(readyAfter?.status).toBe('ready');
      expect(failedAfter?.status).toBe('failed');
    });

    it('does not touch legacy records with no status field (back-compat)', async () => {
      const legacy = await makeFile({ ageMs: 60 * 60 * 1000 }); // no status set
      const count = await fileMethods.sweepOrphanedPreviews();
      expect(count).toBe(0);
      const after = (await fileMethods.findFileById(legacy)) as { status?: string } | null;
      expect(after?.status).toBeUndefined();
    });

    it('respects a custom maxAgeMs cutoff', async () => {
      const old10s = await makeFile({ ageMs: 10 * 1000, status: 'pending' });
      const old1m = await makeFile({ ageMs: 60 * 1000, status: 'pending' });

      // Cutoff = 30s — only the 60s-old record should be swept.
      const count = await fileMethods.sweepOrphanedPreviews(30 * 1000);
      expect(count).toBe(1);

      const tenSecAfter = (await fileMethods.findFileById(old10s)) as { status?: string } | null;
      const oneMinAfter = (await fileMethods.findFileById(old1m)) as {
        status?: string;
        previewError?: string;
      } | null;
      expect(tenSecAfter?.status).toBe('pending');
      expect(oneMinAfter?.status).toBe('failed');
      expect(oneMinAfter?.previewError).toBe('orphaned');
    });

    it('returns 0 when there are no stale pending records', async () => {
      await makeFile({ ageMs: 30 * 1000, status: 'pending' });
      const count = await fileMethods.sweepOrphanedPreviews();
      expect(count).toBe(0);
    });

    describe('strict tenant isolation (boot-time recovery)', () => {
      afterEach(() => {
        delete process.env.TENANT_ISOLATION_STRICT;
        _resetStrictCache();
      });

      it('throws under strict mode without runAsSystem', async () => {
        await runAsSystem(() => makeFile({ ageMs: 10 * 60 * 1000, status: 'pending' }));
        process.env.TENANT_ISOLATION_STRICT = 'true';
        _resetStrictCache();
        await expect(fileMethods.sweepOrphanedPreviews()).rejects.toThrow(
          /Query attempted without tenant context in strict mode/,
        );
      });

      it('succeeds under strict mode when wrapped in runAsSystem', async () => {
        const stale = await runAsSystem(() =>
          makeFile({ ageMs: 10 * 60 * 1000, status: 'pending' }),
        );
        process.env.TENANT_ISOLATION_STRICT = 'true';
        _resetStrictCache();
        const count = await runAsSystem(() => fileMethods.sweepOrphanedPreviews());
        expect(count).toBe(1);
        const after = (await runAsSystem(() => fileMethods.findFileById(stale))) as {
          status?: string;
          previewError?: string;
        } | null;
        expect(after?.status).toBe('failed');
        expect(after?.previewError).toBe('orphaned');
      });
    });
  });
});
