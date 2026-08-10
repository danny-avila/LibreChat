import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { FilterQuery, Model } from 'mongoose';
import type { SearchSink } from '~/models/plugins/projection';
import type { ISearchEvent } from '~/schema/searchevent';
import { applySearchSync } from '~/models/plugins/projection';
import { BASE_TENANT_ID } from '~/config/tenantContext';
import { dedupeSearchEvents } from '~/search/events';
import { createModels } from '~/models';

const mockAddDocuments = jest.fn();
const mockUpdateDocuments = jest.fn();
const mockDeleteDocument = jest.fn();
const mockGetDocument = jest.fn();

jest.mock('meilisearch', () => ({
  MeiliSearch: jest.fn().mockImplementation(() => ({
    index: jest.fn().mockReturnValue({
      getRawInfo: jest.fn(),
      updateSettings: jest.fn(),
      addDocuments: mockAddDocuments,
      addDocumentsInBatches: jest.fn(),
      updateDocuments: mockUpdateDocuments,
      deleteDocument: mockDeleteDocument,
      deleteDocuments: jest.fn(),
      getDocument: mockGetDocument,
      getDocuments: jest.fn().mockReturnValue({ results: [] }),
    }),
  })),
  MeiliSearchTimeOutError: class extends Error {},
}));

type Models = ReturnType<typeof createModels>;

const drain = (SearchEvent: Model<ISearchEvent>) =>
  SearchEvent.find({}, { _id: 0, tenantId: 1, userId: 1, kind: 1, recordId: 1, op: 1 })
    .sort({ _id: 1 })
    .lean<
      Array<{ tenantId: string; userId: string; kind: string; recordId: string; op: string }>
    >();

describe('search-sync projection plugin', () => {
  const OLD_ENV = process.env;
  let mongoServer: MongoMemoryServer;
  let models: Models;

  beforeAll(async () => {
    process.env = {
      ...OLD_ENV,
      CHAT_SEARCH_ENABLED: 'true',
      MEILI_HOST: 'http://meili.test',
      MEILI_MASTER_KEY: 'key',
      MEILI_WRITES_ENABLED: 'false',
    };
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
    models = createModels(mongoose);
  }, 120_000);

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
    process.env = OLD_ENV;
  });

  beforeEach(async () => {
    process.env.CHAT_SEARCH_ENABLED = 'true';
    process.env.MEILI_WRITES_ENABLED = 'false';
    jest.clearAllMocks();
    /**
     * The queue is cleared last: `deleteMany` on the models fires the seam's
     * tombstone hook, which writes into `searchevents`.
     */
    await models.Message.deleteMany({});
    await models.Conversation.deleteMany({});
    await models.SharedLink.deleteMany({});
    await models.SearchEvent.deleteMany({});
  });

  describe('enqueue seam', () => {
    it('enqueues an upsert when a message is saved', async () => {
      await models.Message.create({
        messageId: 'm1',
        conversationId: 'c1',
        user: 'u1',
        text: 'hello world',
        isCreatedByUser: true,
      });

      const events = await drain(models.SearchEvent);
      expect(events).toEqual([
        { tenantId: BASE_TENANT_ID, userId: 'u1', kind: 'message', recordId: 'm1', op: 'upsert' },
      ]);
    });

    it('normalizes an absent tenant to the base sentinel and preserves a real one', async () => {
      await models.Message.create({
        messageId: 'm-tenant',
        conversationId: 'c1',
        user: 'u1',
        tenantId: 'acme',
        text: 'scoped',
        isCreatedByUser: true,
      });

      const events = await drain(models.SearchEvent);
      expect(events).toHaveLength(1);
      expect(events[0].tenantId).toBe('acme');
    });

    it('skips unfinished assistant rows so partial turns are never projected', async () => {
      await models.Message.create({
        messageId: 'm-partial',
        conversationId: 'c1',
        user: 'u1',
        text: 'thinking',
        unfinished: true,
        isCreatedByUser: false,
      });

      expect(await drain(models.SearchEvent)).toEqual([]);

      await models.Message.findOneAndUpdate(
        { messageId: 'm-partial' },
        { $set: { unfinished: false, text: 'done' } },
        { new: true },
      );

      const events = await drain(models.SearchEvent);
      expect(events.map((e) => e.recordId)).toEqual(['m-partial']);
    });

    it('enqueues through findOneAndUpdate with includeResultMetadata (the saveConvo path)', async () => {
      await models.Conversation.findOneAndUpdate(
        { conversationId: 'c-meta' },
        { $set: { conversationId: 'c-meta', user: 'u1', title: 'Imported', endpoint: 'openAI' } },
        { upsert: true, new: true, includeResultMetadata: true },
      );

      const events = await drain(models.SearchEvent);
      expect(events).toEqual([
        {
          tenantId: BASE_TENANT_ID,
          userId: 'u1',
          kind: 'conversation',
          recordId: 'c-meta',
          op: 'upsert',
        },
      ]);
    });

    it('enqueues tombstones for every key a deleteMany removes', async () => {
      await models.Message.create([
        { messageId: 'd1', conversationId: 'c1', user: 'u1', text: 'a', isCreatedByUser: true },
        { messageId: 'd2', conversationId: 'c1', user: 'u1', text: 'b', isCreatedByUser: true },
      ]);
      await models.SearchEvent.deleteMany({});

      await models.Message.deleteMany({ conversationId: 'c1' });

      const events = await drain(models.SearchEvent);
      expect(events.every((e) => e.op === 'tombstone')).toBe(true);
      expect(events.map((e) => e.recordId).sort()).toEqual(['d1', 'd2']);
    });

    /**
     * Tombstones visible while the documents still exist are tombstones a
     * projector drain can consume and overwrite: it re-reads the still-live
     * documents, re-upserts them, and deletes the events — and bulk delete paths
     * never enqueue again. The keys are resolved before the delete, but nothing
     * may reach the queue until the deletion has been applied.
     */
    it('enqueues deleteMany tombstones only after the deletion is applied', async () => {
      await models.Message.create([
        { messageId: 'd1', conversationId: 'c1', user: 'u1', text: 'a', isCreatedByUser: true },
        { messageId: 'd2', conversationId: 'c1', user: 'u1', text: 'b', isCreatedByUser: true },
      ]);
      await models.SearchEvent.deleteMany({});

      const collectionDelete = models.Message.collection.deleteMany.bind(models.Message.collection);
      let queuedWhenDeleteRan = -1;
      const deleteSpy = jest
        .spyOn(models.Message.collection, 'deleteMany')
        .mockImplementation(async (filter, options) => {
          queuedWhenDeleteRan = await models.SearchEvent.countDocuments({});
          return collectionDelete(filter, options);
        });

      try {
        await models.Message.deleteMany({ conversationId: 'c1' });

        expect(deleteSpy).toHaveBeenCalledTimes(1);
        expect(queuedWhenDeleteRan).toBe(0);
        const events = await drain(models.SearchEvent);
        expect(events.every((e) => e.op === 'tombstone')).toBe(true);
        expect(events.map((e) => e.recordId).sort()).toEqual(['d1', 'd2']);
      } finally {
        deleteSpy.mockRestore();
      }
    });

    it('enqueues no deleteMany tombstones when nothing matched', async () => {
      await models.Message.deleteMany({ conversationId: 'c-absent' });

      expect(await drain(models.SearchEvent)).toEqual([]);
    });

    it('costs the write path nothing when chat search is disabled', async () => {
      process.env.CHAT_SEARCH_ENABLED = 'false';
      await models.Message.create({
        messageId: 'm-off',
        conversationId: 'c1',
        user: 'u1',
        text: 'quiet',
        isCreatedByUser: true,
      });
      expect(await drain(models.SearchEvent)).toEqual([]);
    });
  });

  /**
   * `updateOne` and query-form `deleteOne` are query middleware, so Mongoose hands
   * the post hook the write result rather than the affected document — there is no
   * key on it to enqueue. `updateMessageText` is exactly this shape, so an edited
   * message used to reach PostgreSQL only if the safety poll happened to reach it.
   */
  describe('query middleware', () => {
    beforeEach(async () => {
      await models.Message.create({
        messageId: 'm-edit',
        conversationId: 'c1',
        user: 'u1',
        text: 'before the edit',
        isCreatedByUser: true,
      });
      await models.SearchEvent.deleteMany({});
    });

    it('enqueues an upsert for Model.updateOne', async () => {
      await models.Message.updateOne({ messageId: 'm-edit', user: 'u1' }, { text: 'after' });

      expect(await drain(models.SearchEvent)).toEqual([
        {
          tenantId: BASE_TENANT_ID,
          userId: 'u1',
          kind: 'message',
          recordId: 'm-edit',
          op: 'upsert',
        },
      ]);
    });

    it('enqueues a tombstone for query-form deleteOne', async () => {
      await models.Message.deleteOne({ messageId: 'm-edit', user: 'u1' });

      expect(await drain(models.SearchEvent)).toEqual([
        {
          tenantId: BASE_TENANT_ID,
          userId: 'u1',
          kind: 'message',
          recordId: 'm-edit',
          op: 'tombstone',
        },
      ]);
    });

    /**
     * A filter that does not name the record and its owner cannot supply the key,
     * so it is read back. The common call sites do name both, which is why the
     * read is a fallback rather than a cost on every update.
     */
    it('reads the key back when the filter does not carry it', async () => {
      await models.Message.updateOne({ conversationId: 'c1' }, { text: 'after' });

      expect(await drain(models.SearchEvent)).toEqual([
        {
          tenantId: BASE_TENANT_ID,
          userId: 'u1',
          kind: 'message',
          recordId: 'm-edit',
          op: 'upsert',
        },
      ]);
    });

    it('enqueues nothing when the update matched no document', async () => {
      await models.Message.updateOne({ messageId: 'm-absent', user: 'u1' }, { text: 'after' });

      expect(await drain(models.SearchEvent)).toEqual([]);
    });

    it('costs the write path no extra read when chat search is disabled', async () => {
      process.env.CHAT_SEARCH_ENABLED = 'false';
      const findOne = jest.spyOn(models.Message, 'findOne');

      await models.Message.updateOne({ conversationId: 'c1' }, { text: 'after' });

      expect(findOne).not.toHaveBeenCalled();
      expect(await drain(models.SearchEvent)).toEqual([]);
    });

    it('enqueues through a lean findOneAndUpdate result (the updateSharedLink shape)', async () => {
      await models.SharedLink.create({
        shareId: 's-lean',
        conversationId: 'c1',
        user: 'u1',
        title: 'Shared',
      });
      await models.SearchEvent.deleteMany({});

      await models.SharedLink.findOneAndUpdate(
        { shareId: 's-lean', user: 'u1' },
        { $set: { title: 'Renamed' } },
        { new: true, upsert: false, runValidators: true },
      ).lean();

      expect(await drain(models.SearchEvent)).toEqual([
        {
          tenantId: BASE_TENANT_ID,
          userId: 'u1',
          kind: 'shared-link',
          recordId: 's-lean',
          op: 'upsert',
        },
      ]);
    });

    it('enqueues through a projection-narrowed lean findOneAndUpdate (the updateToolCallResult shape)', async () => {
      await models.Message.findOneAndUpdate(
        { messageId: 'm-edit', user: 'u1', conversationId: 'c1' },
        { $set: { text: 'tool result attached' } },
        { new: true, projection: { unfinished: 1 } },
      ).lean();

      expect(await drain(models.SearchEvent)).toEqual([
        {
          tenantId: BASE_TENANT_ID,
          userId: 'u1',
          kind: 'message',
          recordId: 'm-edit',
          op: 'upsert',
        },
      ]);
    });

    it('enqueues nothing when a lean findOneAndUpdate matches no document', async () => {
      await models.Message.findOneAndUpdate(
        { messageId: 'm-absent', user: 'u1' },
        { $set: { text: 'never lands' } },
        { new: true },
      ).lean();

      expect(await drain(models.SearchEvent)).toEqual([]);
    });
  });

  describe('Meilisearch as an optional sink', () => {
    /**
     * The upgrade case, stated as the environment an existing deployment
     * actually has: Mongo, Meilisearch credentials, and not one of the new
     * variables. Writes have to keep reaching Meilisearch, because nothing would
     * tell an operator otherwise — `indexSync` skips its catch-up until the
     * backlog passes `MEILI_SYNC_THRESHOLD`, so a silent write-path default
     * would lose a thousand messages before it surfaced.
     */
    it('keeps indexing writes for a deployment that upgrades and sets nothing new', async () => {
      process.env = {
        ...OLD_ENV,
        MEILI_HOST: 'http://meili.test',
        MEILI_MASTER_KEY: 'key',
      };
      delete process.env.MEILI_WRITES_ENABLED;
      delete process.env.CHAT_SEARCH_ENABLED;

      await models.Message.create({
        messageId: 'm-brownfield',
        conversationId: 'c1',
        user: 'u1',
        text: 'still indexed',
        isCreatedByUser: true,
      });

      expect(mockAddDocuments).toHaveBeenCalledTimes(1);
      /** And no projection events, since chat search was never configured. */
      expect(await drain(models.SearchEvent)).toEqual([]);
    });

    it('writes nothing to Meili while MEILI_WRITES_ENABLED is false, even with credentials set', async () => {
      await models.Message.create({
        methodless: undefined,
        messageId: 'm-nosink',
        conversationId: 'c1',
        user: 'u1',
        text: 'not indexed',
        isCreatedByUser: true,
      } as never);

      expect(mockAddDocuments).not.toHaveBeenCalled();
      expect(mockUpdateDocuments).not.toHaveBeenCalled();
      /** The projection queue is unaffected: the sink is optional, the seam is not. */
      expect(await drain(models.SearchEvent)).toHaveLength(1);
    });

    it('writes to Meili once the flag is flipped on for a legacy rollback', async () => {
      process.env.MEILI_WRITES_ENABLED = 'true';
      await models.Message.create({
        messageId: 'm-sink',
        conversationId: 'c1',
        user: 'u1',
        text: 'indexed',
        isCreatedByUser: true,
      });

      expect(mockAddDocuments).toHaveBeenCalledTimes(1);
      expect(mockAddDocuments.mock.calls[0][1]).toEqual({ primaryKey: 'messageId' });
    });

    it('does not delete from Meili on deleteOne while writes are disabled', async () => {
      process.env.MEILI_WRITES_ENABLED = 'true';
      const message = await models.Message.create({
        messageId: 'm-del',
        conversationId: 'c1',
        user: 'u1',
        text: 'bye',
        isCreatedByUser: true,
      });
      process.env.MEILI_WRITES_ENABLED = 'false';
      mockDeleteDocument.mockClear();

      await message.deleteOne();

      expect(mockDeleteDocument).not.toHaveBeenCalled();
    });

    /**
     * The Meilisearch sink resolves the affected primary keys by re-querying
     * Mongo with the deleteMany conditions, so it only works while the
     * documents still exist. Fanned out after the delete, the lookup returns
     * nothing and Meilisearch retains every deleted document forever.
     */
    it('deletes each removed document from Meili on deleteMany', async () => {
      process.env.MEILI_WRITES_ENABLED = 'true';
      await models.Message.create([
        { messageId: 'd1', conversationId: 'c1', user: 'u1', text: 'a', isCreatedByUser: true },
        { messageId: 'd2', conversationId: 'c1', user: 'u1', text: 'b', isCreatedByUser: true },
      ]);
      mockDeleteDocument.mockClear();

      await models.Message.deleteMany({ conversationId: 'c1' });

      expect(mockDeleteDocument.mock.calls.map((call) => call[0]).sort()).toEqual(['d1', 'd2']);
    });
  });

  describe('deleteMany sink ordering', () => {
    type ProbeDocument = { noteId?: string; user?: string; text?: string };
    const liveDocsSeen: number[] = [];
    let Probe: Model<ProbeDocument>;

    beforeAll(() => {
      const probeSchema = new mongoose.Schema<ProbeDocument>({
        noteId: String,
        user: String,
        text: String,
      });
      const probeSink: SearchSink = {
        name: 'probe',
        isEnabled: () => true,
        upsert: async () => undefined,
        remove: async () => undefined,
        async removeMany(conditions: FilterQuery<unknown>): Promise<void> {
          const docs = await Probe.find(conditions).lean();
          liveDocsSeen.push(docs.length);
        },
      };
      applySearchSync(probeSchema, {
        mongoose,
        kind: 'message',
        primaryKey: 'noteId',
        sinks: [probeSink],
      });
      Probe = mongoose.model<ProbeDocument>('SinkOrderingProbe', probeSchema);
    });

    it('fans deleteMany out to sinks while the documents are still readable', async () => {
      await Probe.create([
        { noteId: 'n1', user: 'u1', text: 'a' },
        { noteId: 'n2', user: 'u1', text: 'b' },
      ]);
      liveDocsSeen.length = 0;

      await Probe.deleteMany({ user: 'u1' });

      expect(liveDocsSeen).toEqual([2]);
      expect(await Probe.countDocuments({})).toBe(0);
    });
  });

  describe('legacy shared links without a shareId', () => {
    it('keys the event by the Mongo _id when the record carries no shareId', async () => {
      const link = await models.SharedLink.create({
        conversationId: 'c1',
        user: 'u1',
        title: 'Legacy',
      });

      expect(await drain(models.SearchEvent)).toEqual([
        {
          tenantId: BASE_TENANT_ID,
          userId: 'u1',
          kind: 'shared-link',
          recordId: String(link._id),
          op: 'upsert',
        },
      ]);
    });

    it('keys deleteMany tombstones for no-shareId links by their Mongo _ids', async () => {
      const links = await models.SharedLink.create([
        { conversationId: 'c1', user: 'u1', title: 'first' },
        { conversationId: 'c2', user: 'u1', title: 'second' },
      ]);
      await models.SearchEvent.deleteMany({});

      await models.SharedLink.deleteMany({ user: 'u1' });

      const events = await drain(models.SearchEvent);
      expect(events.every((event) => event.op === 'tombstone')).toBe(true);
      expect(events.map((event) => event.recordId).sort()).toEqual(
        links.map((link) => String(link._id)).sort(),
      );
    });
  });

  describe('explicit enqueue from central deletion methods', () => {
    it('tombstones a shared link deleted through findOneAndDelete', async () => {
      await models.SharedLink.create({
        shareId: 's1',
        conversationId: 'c1',
        user: 'u1',
        title: 'Shared',
      });
      await models.SearchEvent.deleteMany({});

      await models.SharedLink.findOneAndDelete({ shareId: 's1', user: 'u1' }).lean();

      /**
       * `findOneAndDelete` fires no delete middleware at all, which is exactly
       * why `deleteSharedLink` enqueues explicitly rather than trusting the seam.
       */
      expect(await drain(models.SearchEvent)).toEqual([]);
    });
  });

  describe('bulk write invisibility', () => {
    it('proves bulkWrite skips the seam, which is why import enqueues explicitly', async () => {
      await models.Conversation.bulkWrite([
        {
          updateOne: {
            filter: { conversationId: 'c-bulk', user: 'u1' },
            update: {
              $set: { conversationId: 'c-bulk', user: 'u1', title: 'Bulk', endpoint: 'openAI' },
            },
            upsert: true,
            timestamps: false,
          },
        },
      ]);

      expect(await drain(models.SearchEvent)).toEqual([]);
    });
  });
});

describe('dedupeSearchEvents', () => {
  const event = (recordId: string, op: 'upsert' | 'tombstone') => ({
    _id: new mongoose.Types.ObjectId(),
    tenantId: BASE_TENANT_ID,
    userId: 'u1',
    kind: 'message' as const,
    recordId,
    op,
  });

  it('collapses repeated upserts for one key', () => {
    const deduped = dedupeSearchEvents([event('m1', 'upsert'), event('m1', 'upsert')]);
    expect(deduped).toHaveLength(1);
  });

  it('lets a tombstone win regardless of arrival order', () => {
    expect(dedupeSearchEvents([event('m1', 'upsert'), event('m1', 'tombstone')])[0].op).toBe(
      'tombstone',
    );
    expect(dedupeSearchEvents([event('m1', 'tombstone'), event('m1', 'upsert')])[0].op).toBe(
      'tombstone',
    );
  });

  it('keeps distinct keys apart, including the same record id in another tenant', () => {
    const other = { ...event('m1', 'upsert'), tenantId: 'acme' };
    expect(dedupeSearchEvents([event('m1', 'upsert'), other])).toHaveLength(2);
  });
});
