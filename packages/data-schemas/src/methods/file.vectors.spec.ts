import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { FileContext } from 'librechat-data-provider';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { IMongoFile } from '~/types/file';
import type { VectorReuseQuery } from './file';
import { createFileMethods } from './file';
import { createModels } from '~/models';

let File: mongoose.Model<IMongoFile>;
let fileMethods: ReturnType<typeof createFileMethods>;
let mongoServer: MongoMemoryServer;
let modelsToCleanup: string[] = [];

const userId = new mongoose.Types.ObjectId();
const otherUserId = new mongoose.Types.ObjectId();
const HASH = 'a'.repeat(64);
const OTHER_HASH = 'b'.repeat(64);

type FileSeed = Partial<IMongoFile> & { file_id?: string };

const seedFile = async (overrides: FileSeed = {}): Promise<IMongoFile> => {
  const file = await File.create({
    file_id: overrides.file_id ?? uuidv4(),
    user: userId,
    filename: 'report.pdf',
    filepath: '/uploads/report.pdf',
    type: 'application/pdf',
    bytes: 1024,
    embedded: true,
    hash: HASH,
    vectorOwner: userId.toString(),
    vectorExtension: '.pdf',
    context: FileContext.message_attachment,
    ...overrides,
  });
  return file.toObject() as IMongoFile;
};

describe('vector reuse file methods', () => {
  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    const models = createModels(mongoose);
    modelsToCleanup = Object.keys(models);
    Object.assign(mongoose.models, models);

    File = mongoose.models.File as mongoose.Model<IMongoFile>;
    fileMethods = createFileMethods(mongoose);
  });

  afterAll(async () => {
    const collections = mongoose.connection.collections;
    for (const key in collections) {
      await collections[key].deleteMany({});
    }
    for (const modelName of modelsToCleanup) {
      delete mongoose.models[modelName];
    }
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await File.deleteMany({});
  });

  describe('findVectorReuseCandidates', () => {
    const scope = () => ({
      type: 'application/pdf',
      extension: '.pdf',
      vectorOwner: userId.toString(),
    });

    it('finds an embedded file with matching content', async () => {
      const seeded = await seedFile();

      const candidates = await fileMethods.findVectorReuseCandidates({
        hash: HASH,
        ...scope(),
        context: FileContext.message_attachment,
      });

      expect(candidates.map((file) => file.file_id)).toEqual([seeded.file_id]);
    });

    it('refuses to run unscoped', async () => {
      await seedFile();

      const context = FileContext.message_attachment;
      const unscoped: VectorReuseQuery[] = [
        { ...scope(), context, hash: '' },
        { ...scope(), context, hash: HASH, type: '' },
        { ...scope(), context, hash: HASH, vectorOwner: '' },
      ];

      for (const query of unscoped) {
        await expect(fileMethods.findVectorReuseCandidates(query)).resolves.toEqual([]);
      }
    });

    it('never crosses hashes, types, extensions, owners or contexts', async () => {
      await seedFile({ hash: OTHER_HASH });
      await seedFile({ type: 'text/plain' });
      await seedFile({ vectorOwner: 'agent_elsewhere' });
      await seedFile({ vectorOwner: undefined });
      await seedFile({ vectorExtension: '.txt' });
      await seedFile({ vectorExtension: undefined });
      await seedFile({ context: FileContext.agents });

      const candidates = await fileMethods.findVectorReuseCandidates({
        hash: HASH,
        ...scope(),
        context: FileContext.message_attachment,
      });

      expect(candidates).toEqual([]);
    });

    it('skips files that are not embedded', async () => {
      await seedFile({ embedded: false });
      await seedFile({ embedded: undefined });

      const candidates = await fileMethods.findVectorReuseCandidates({
        hash: HASH,
        ...scope(),
        context: FileContext.message_attachment,
      });

      expect(candidates).toEqual([]);
    });

    it('skips files whose vectors are on a deletion clock', async () => {
      await seedFile({ expiredAt: new Date(Date.now() + 60_000) });
      await seedFile({ expiresAt: new Date(Date.now() + 60_000) });

      const candidates = await fileMethods.findVectorReuseCandidates({
        hash: HASH,
        ...scope(),
        context: FileContext.message_attachment,
      });

      expect(candidates).toEqual([]);
    });

    it('scopes to a tenant when one is given', async () => {
      await seedFile({ tenantId: 'tenant-a' });

      await expect(
        fileMethods.findVectorReuseCandidates({
          hash: HASH,
          ...scope(),
          tenantId: 'tenant-b',
          context: FileContext.message_attachment,
        }),
      ).resolves.toEqual([]);

      const matched = await fileMethods.findVectorReuseCandidates({
        hash: HASH,
        ...scope(),
        tenantId: 'tenant-a',
        context: FileContext.message_attachment,
      });
      expect(matched).toHaveLength(1);
    });

    /* An agent's knowledge belongs to the agent, so any editor cleared to
     * upload to it may reuse what an earlier one embedded. */
    it('finds an upload by another editor under the same agent', async () => {
      const byOtherEditor = await seedFile({
        user: otherUserId,
        context: FileContext.agents,
        vectorOwner: 'agent_shared',
      });

      const candidates = await fileMethods.findVectorReuseCandidates({
        hash: HASH,
        type: 'application/pdf',
        extension: '.pdf',
        vectorOwner: 'agent_shared',
        context: FileContext.agents,
      });

      expect(candidates.map((file) => file.file_id)).toEqual([byOtherEditor.file_id]);
    });

    /* A file uploaded to one agent can be attached to another, and its chunks
     * stay stamped with the first — being listed must not imply ownership. */
    it('refuses a file whose vectors another agent owns', async () => {
      await seedFile({ context: FileContext.agents, vectorOwner: 'agent_a' });

      await expect(
        fileMethods.findVectorReuseCandidates({
          hash: HASH,
          type: 'application/pdf',
          extension: '.pdf',
          vectorOwner: 'agent_b',
          context: FileContext.agents,
        }),
      ).resolves.toEqual([]);
    });

    /* Every file-search upload runs this lookup, so its cost must not grow with
     * the number of hashed files. Asserted on documents examined rather than on
     * the plan shape: a sort-providing index reads the whole collection while
     * still reporting an IXSCAN, and a partial index the planner considers
     * ineligible disappears silently. */
    it('seeks its candidates instead of scanning the hashed population', async () => {
      await File.createIndexes();
      await File.insertMany(
        Array.from({ length: 300 }, (_, i) => ({
          file_id: `other-${i}`,
          user: otherUserId,
          filename: 'other.pdf',
          filepath: '/uploads/other.pdf',
          type: 'application/pdf',
          bytes: 1,
          embedded: true,
          hash: String(i).padStart(64, '0'),
          vectorOwner: `owner-${i}`,
          vectorExtension: '.pdf',
          context: FileContext.message_attachment,
        })),
      );
      await seedFile();

      const stats = (await File.find({
        hash: HASH,
        type: 'application/pdf',
        vectorOwner: userId.toString(),
        vectorExtension: '.pdf',
        context: FileContext.message_attachment,
        embedded: true,
        expiredAt: null,
        expiresAt: null,
      })
        .sort({ createdAt: 1 })
        .limit(20)
        .explain('executionStats')) as { executionStats?: { totalDocsExamined?: number } };

      expect(stats.executionStats?.totalDocsExamined).toBeLessThan(5);
    });

    /* The limit must not be able to hide a compatible record behind a run of
     * same-hash uploads under another extension. */
    it('finds a compatible record behind many same-hash uploads of another extension', async () => {
      await File.insertMany(
        Array.from({ length: 30 }, (_, i) => ({
          file_id: `as-text-${i}`,
          user: userId,
          filename: 'report.txt',
          filepath: '/uploads/report.txt',
          type: 'application/pdf',
          bytes: 1,
          embedded: true,
          hash: HASH,
          vectorOwner: userId.toString(),
          vectorExtension: '.txt',
          context: FileContext.message_attachment,
          createdAt: new Date('2020-01-01'),
        })),
      );
      const reusable = await seedFile({ createdAt: new Date('2030-01-01') });

      const candidates = await fileMethods.findVectorReuseCandidates({
        hash: HASH,
        ...scope(),
        context: FileContext.message_attachment,
      });

      expect(candidates.map((file) => file.file_id)).toEqual([reusable.file_id]);
    });

    it('returns candidates oldest first and honors the limit', async () => {
      const first = await seedFile({ createdAt: new Date('2026-01-01') });
      const second = await seedFile({ createdAt: new Date('2026-02-01') });
      await seedFile({ createdAt: new Date('2026-03-01') });

      const all = await fileMethods.findVectorReuseCandidates({
        hash: HASH,
        ...scope(),
        context: FileContext.message_attachment,
      });
      expect(all.slice(0, 2).map((file) => file.file_id)).toEqual([first.file_id, second.file_id]);

      const limited = await fileMethods.findVectorReuseCandidates({
        hash: HASH,
        ...scope(),
        context: FileContext.message_attachment,
        limit: 1,
      });
      expect(limited).toHaveLength(1);
    });
  });

  describe('countVectorReferences', () => {
    it('returns an empty map when asked for nothing', async () => {
      await expect(fileMethods.countVectorReferences({ vectorIds: [] })).resolves.toEqual(
        new Map(),
      );
    });

    it('counts the original alongside every borrower', async () => {
      const original = await seedFile({ file_id: 'original' });
      await seedFile({ file_id: 'borrower-1', vectorId: original.file_id });
      await seedFile({ file_id: 'borrower-2', vectorId: original.file_id });

      const counts = await fileMethods.countVectorReferences({ vectorIds: ['original'] });

      expect(counts.get('original')).toBe(3);
    });

    it('ignores files excluded from the count', async () => {
      await seedFile({ file_id: 'original' });
      await seedFile({ file_id: 'borrower', vectorId: 'original' });

      const counts = await fileMethods.countVectorReferences({
        vectorIds: ['original'],
        excludeFileIds: ['borrower'],
      });

      expect(counts.get('original')).toBe(1);
    });

    it('omits vector ids with no remaining references', async () => {
      await seedFile({ file_id: 'original' });
      await seedFile({ file_id: 'borrower', vectorId: 'original' });

      const counts = await fileMethods.countVectorReferences({
        vectorIds: ['original'],
        excludeFileIds: ['original', 'borrower'],
      });

      expect(counts.has('original')).toBe(false);
    });

    it('does not treat an unrelated file id as a reference', async () => {
      await seedFile({ file_id: 'original' });
      await seedFile({ file_id: 'unrelated' });

      const counts = await fileMethods.countVectorReferences({
        vectorIds: ['original'],
        excludeFileIds: ['original'],
      });

      expect(counts.has('original')).toBe(false);
    });

    it('counts several vector documents in one round trip', async () => {
      await seedFile({ file_id: 'doc-a' });
      await seedFile({ file_id: 'a-borrower', vectorId: 'doc-a' });
      await seedFile({ file_id: 'doc-b' });

      const counts = await fileMethods.countVectorReferences({
        vectorIds: ['doc-a', 'doc-b'],
        excludeFileIds: ['doc-a', 'doc-b'],
      });

      expect(counts.get('doc-a')).toBe(1);
      expect(counts.has('doc-b')).toBe(false);
    });
  });
});
