import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { TagRecord } from '~/tags/membership';
import type { IConversation } from '~/types';
import {
  migrateConversationTags,
  assertConversationTagMigration,
} from '~/migrations/conversationTags';
import { hydrateConversationTags, resolveTagNames } from '~/tags/membership';
import { createConversationTagMethods } from './conversationTag';
import { tenantStorage } from '~/config/tenantContext';
import { createMethods } from '~/methods';
import { createModels } from '~/models';

let server: MongoMemoryServer;
let Conversations: mongoose.Model<IConversation>;
let Catalog: mongoose.Model<TagRecord>;
let methods: ReturnType<typeof createConversationTagMethods>;
beforeAll(async () => {
  server = await MongoMemoryServer.create();
  await mongoose.connect(server.getUri());
  createModels(mongoose);
  Conversations = mongoose.models.Conversation;
  Catalog = mongoose.models.ConversationTag;
  methods = createConversationTagMethods(mongoose);
});
afterEach(async () => {
  jest.restoreAllMocks();
  await Conversations.deleteMany({});
  await Catalog.deleteMany({});
  await mongoose.connection.db!.collection('schema_migrations').deleteMany({});
});
afterAll(async () => {
  await mongoose.disconnect();
  await server.stop();
});

async function seed(user = 'owner', tenantId?: string) {
  const tag = await methods.createConversationTag(
    user,
    { tag: 'old', description: 'description' },
    tenantId ?? null,
  );
  const conversation = await Conversations.create({
    user,
    tenantId,
    conversationId: 'convo',
    endpoint: 'openAI',
    tagIds: [],
  });
  return { tag: tag!, conversation };
}

it.each([null, 'tenant-a'])(
  'assignment retains identity when rename wins before membership commit (%s)',
  async (tenantId) => {
    const { tag } = await seed('owner', tenantId ?? undefined);
    const Conversation = Conversations;
    const original = Conversation.collection.findOneAndUpdate.bind(Conversation.collection);
    let arrive!: () => void;
    let release!: () => void;
    const paused = new Promise<void>((resolve) => {
      arrive = resolve;
    });
    const resume = new Promise<void>((resolve) => {
      release = resolve;
    });
    const write = jest
      .spyOn(Conversation.collection, 'findOneAndUpdate')
      .mockImplementationOnce(async (...args) => {
        arrive();
        await resume;
        return original(...args);
      });
    const assignment = methods.updateTagsForConversation('owner', 'convo', ['old'], tenantId);
    await paused;
    await methods.updateConversationTag('owner', String(tag._id), { tag: 'new' }, tenantId, true);
    release();
    expect(await assignment).toEqual(['new']);
    write.mockRestore();
    const row = await Conversation.findOne({ user: 'owner' }).lean();
    expect(row?.tagIds).toEqual([String(tag._id)]);
    expect(await methods.getConversationTags('owner', tenantId)).toEqual([
      expect.objectContaining({ tag: 'new', count: 1 }),
    ]);
  },
);

it('renames without rewriting membership or conversation timestamps', async () => {
  const { tag } = await seed();
  await methods.updateTagsForConversation('owner', 'convo', [String(tag._id)], null, true);
  const before = await Conversations.findOne({ user: 'owner' }).lean();
  const update = jest.spyOn(Conversations, 'updateMany');
  await methods.updateConversationTag('owner', String(tag._id), { tag: 'new' }, null, true);
  expect(update).not.toHaveBeenCalled();
  const after = await Conversations.findOne({ user: 'owner' }).lean();
  expect(after?.tagIds).toEqual(before?.tagIds);
  expect(after?.updatedAt).toEqual(before?.updatedAt);
});

it('a late assignment to a deleted identity never joins its replacement', async () => {
  const { tag } = await seed();
  const Conversation = Conversations;
  const original = Conversation.collection.findOneAndUpdate.bind(Conversation.collection);
  let arrive!: () => void;
  let release!: () => void;
  const paused = new Promise<void>((resolve) => {
    arrive = resolve;
  });
  const resume = new Promise<void>((resolve) => {
    release = resolve;
  });
  jest
    .spyOn(Conversation.collection, 'findOneAndUpdate')
    .mockImplementationOnce(async (...args) => {
      arrive();
      await resume;
      return original(...args);
    });
  const assignment = methods.updateTagsForConversation(
    'owner',
    'convo',
    [String(tag._id)],
    null,
    true,
  );
  await paused;
  await methods.deleteConversationTag('owner', String(tag._id), null, true);
  const replacement = await methods.createConversationTag('owner', { tag: 'old' }, null);
  release();
  expect(await assignment).toEqual([]);
  expect(String(replacement?._id)).not.toBe(String(tag._id));
  expect(await methods.getConversationTags('owner', null)).toEqual([
    expect.objectContaining({ count: 0 }),
  ]);
  const row = await Conversation.findOne({ user: 'owner' }).lean();
  expect((await hydrateConversationTags(mongoose, [row!]))[0].tagIds).toEqual([]);
});

it('rejects foreign IDs and does not interpret a hex label as an identity', async () => {
  await seed();
  const foreign = await methods.createConversationTag('foreign', { tag: 'foreign' });
  const tenant = await methods.createConversationTag('owner', { tag: 'tenant' }, 'other');
  for (const id of [foreign!._id, tenant!._id]) {
    await expect(
      methods.updateTagsForConversation('owner', 'convo', [String(id)], null, true),
    ).rejects.toThrow('Tag not found');
  }
  const hex = String(new mongoose.Types.ObjectId());
  const [id] = await resolveTagNames(mongoose, 'owner', [hex], null);
  expect(id).not.toBe(hex);
  expect(await methods.updateTagsForConversation('owner', 'convo', [hex], null)).toEqual([hex]);
});

it('only one concurrent rename can claim a destination name', async () => {
  const first = await methods.createConversationTag('owner', { tag: 'first' });
  const second = await methods.createConversationTag('owner', { tag: 'second' });
  const results = await Promise.allSettled(
    [first, second].map((tag) =>
      methods.updateConversationTag('owner', String(tag!._id), { tag: 'destination' }, null, true),
    ),
  );
  expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  expect(await Catalog.countDocuments({ user: 'owner', tag: 'destination' })).toBe(1);
});

it('counts committed distinct membership without relying on cached counts', async () => {
  const { tag } = await seed();
  await Catalog.updateOne({ _id: tag._id }, { $set: { count: 999 } });
  await Conversations.updateOne(
    { user: 'owner' },
    { $set: { tagIds: [String(tag._id), String(tag._id)] } },
  );
  expect((await methods.getConversationTags('owner'))[0].count).toBe(1);
  await Conversations.deleteMany({ user: 'owner' });
  expect((await methods.getConversationTags('owner'))[0].count).toBe(0);
});

it('dry-runs and idempotently migrates catalog and missing names without changing history', async () => {
  const Tag = Catalog;
  const Convo = Conversations;
  const tag = await Tag.create({
    user: 'owner',
    tag: 'existing',
    description: 'keep',
    position: 9,
  });
  const updatedAt = new Date('2020-01-01');
  await Convo.collection.insertMany([
    {
      user: 'owner',
      conversationId: 'legacy',
      tags: ['existing', 'missing', 'existing'],
      updatedAt,
    },
    {
      user: 'owner',
      tenantId: 'tenant-a',
      conversationId: 'tenant',
      tags: ['existing'],
      updatedAt,
    },
  ]);
  await expect(assertConversationTagMigration(mongoose.connection)).rejects.toThrow(
    'migration required',
  );
  expect(await migrateConversationTags(mongoose.connection)).toEqual({
    scanned: 2,
    updated: 2,
    createdTags: 2,
  });
  expect(await Tag.countDocuments()).toBe(1);
  await migrateConversationTags(mongoose.connection, { dryRun: false });
  expect(await migrateConversationTags(mongoose.connection, { dryRun: false })).toEqual({
    scanned: 2,
    updated: 0,
    createdTags: 0,
  });
  const row = await Convo.findOne({ conversationId: 'legacy' }).lean();
  expect(row?.tagIds).toHaveLength(2);
  expect(row?.tagIds?.[0]).toBe(String(tag._id));
  expect(row?.updatedAt).toEqual(updatedAt);
  expect(await Tag.findById(tag._id).lean()).toMatchObject({ description: 'keep', position: 9 });
  expect((await hydrateConversationTags(mongoose, [row!]))[0].tags).toEqual([
    'existing',
    'missing',
  ]);
  await expect(assertConversationTagMigration(mongoose.connection)).resolves.toBeUndefined();
});

it('validates all legacy records before any migration writes', async () => {
  await Conversations.collection.insertMany([
    { user: 'owner', conversationId: 'valid', tags: ['new'] },
    { user: 'owner', conversationId: 'invalid', tags: [null] },
  ]);
  await expect(migrateConversationTags(mongoose.connection, { dryRun: false })).rejects.toThrow(
    'malformed',
  );
  expect(await Catalog.countDocuments()).toBe(0);
  expect(await Conversations.countDocuments({ tagIds: { $exists: true } })).toBe(0);
});

it('keeps creation idempotent and appends new labels without overwriting descriptions', async () => {
  const first = await methods.createConversationTag('owner', { tag: 'first', description: 'kept' });
  const second = await methods.createConversationTag('owner', { tag: 'second' });
  const retried = await methods.createConversationTag('owner', {
    tag: 'first',
    description: 'ignored',
  });
  expect(retried?._id).toEqual(first?._id);
  expect(retried?.description).toBe('kept');
  expect(second?.position).toBe((first?.position ?? 0) + 1);
});

it('resolves portable import labels locally and ignores source IDs', async () => {
  const foreign = await methods.createConversationTag('foreign', { tag: 'source' });
  const db = createMethods(mongoose);
  await db.bulkSaveConvos([
    {
      user: 'owner',
      conversationId: 'import',
      endpoint: 'openAI',
      tags: ['portable'],
      tagIds: [String(foreign!._id)],
    },
  ]);
  const saved = await db.getConvoWithTags('owner', 'import');
  expect(saved?.tags).toEqual(['portable']);
  expect(saved?.tagIds).toHaveLength(1);
  expect(saved?.tagIds).not.toContain(String(foreign!._id));
});

it('preserves a local copy identity when the source label changes before persistence', async () => {
  const { tag } = await seed();
  await methods.updateTagsForConversation('owner', 'convo', [String(tag._id)], null, true);
  const db = createMethods(mongoose);
  const original = await db.getConvo('owner', 'convo');
  await methods.updateConversationTag('owner', String(tag._id), { tag: 'renamed' }, null, true);
  const copy = { ...original, conversationId: 'local-copy' };
  delete copy._id;
  await db.bulkSaveConvos([copy], { tagSource: 'owned' });
  expect(await db.getConvoWithTags('owner', 'local-copy')).toMatchObject({
    tags: ['renamed'],
    tagIds: [String(tag._id)],
  });
  expect(await Catalog.countDocuments({ user: 'owner', tag: 'old' })).toBe(0);
});

it('returns an empty page for a deleted bookmark filter', async () => {
  const { tag } = await seed();
  await methods.deleteConversationTag('owner', String(tag._id), null, true);
  expect(
    await createMethods(mongoose).getConvosByCursor('owner', { tagIds: [String(tag._id)] }),
  ).toMatchObject({ conversations: [] });
});

it('resumes an interrupted offline batch without allocating replacement identities', async () => {
  const rows = Array.from({ length: 501 }, (_, index) => ({
    user: 'owner',
    conversationId: `migration-${index}`,
    tags: ['portable'],
    updatedAt: new Date('2020-01-01'),
  }));
  await Conversations.collection.insertMany(rows);
  const collection = mongoose.connection.db!.collection('conversations');
  const original = collection.bulkWrite.bind(collection);
  const write = jest
    .spyOn(Object.getPrototypeOf(collection) as typeof collection, 'bulkWrite')
    .mockImplementationOnce((...args) => original(...args))
    .mockRejectedValueOnce(new Error('interrupted batch'));
  await expect(migrateConversationTags(mongoose.connection, { dryRun: false })).rejects.toThrow(
    'interrupted batch',
  );
  write.mockRestore();
  const catalog = await Catalog.findOne({ user: 'owner', tag: 'portable' }).lean();
  expect(await collection.countDocuments({ tagIds: { $exists: true } })).toBe(500);
  await migrateConversationTags(mongoose.connection, { dryRun: false });
  expect(await collection.countDocuments({ tagIds: [String(catalog!._id)] })).toBe(501);
  expect(await Catalog.countDocuments({ user: 'owner' })).toBe(1);
  expect(await collection.countDocuments({ updatedAt: new Date('2020-01-01') })).toBe(501);
});

it('keeps tagged shared reads and ordinary message saves free of catalog queries', async () => {
  const { tag } = await seed();
  await methods.updateTagsForConversation('owner', 'convo', [String(tag._id)], null, true);
  const find = jest.spyOn(Catalog.collection, 'find');
  const db = createMethods(mongoose);
  const raw = await db.getConvo('owner', 'convo');
  expect(raw?.tagIds).toEqual([String(tag._id)]);
  expect(raw).not.toHaveProperty('tags');
  const saved = await db.saveConvo(
    { userId: 'owner' },
    { conversationId: 'convo', title: 'next message' },
    { appendMessageIds: [] },
  );
  expect(saved).toMatchObject({ tagIds: [String(tag._id)] });
  expect(find).not.toHaveBeenCalled();
  expect(await Conversations.findOne({ conversationId: 'convo' }).lean()).toMatchObject({
    tagIds: [String(tag._id)],
  });
});

it('starts public catalog projection while the owned conversation read is pending', async () => {
  const { tag } = await seed();
  await methods.updateTagsForConversation('owner', 'convo', [String(tag._id)], null, true);
  const original = Conversations.collection.findOne.bind(Conversations.collection);
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  jest.spyOn(Conversations.collection, 'findOne').mockImplementationOnce(async (...args) => {
    await pending;
    return original(...args);
  });
  const find = jest.spyOn(Catalog.collection, 'find');
  const db = createMethods(mongoose);
  const read = db.getConvoWithTags('owner', 'convo');
  await new Promise((resolve) => setImmediate(resolve));
  expect(find).toHaveBeenCalledTimes(1);
  release();
  expect(await read).toMatchObject({ tagIds: [String(tag._id)], tags: ['old'] });
  expect(await db.getConvoWithTags('foreign', 'convo')).toBeNull();
});

it.each(['attach', 'save', 'bulk'] as const)(
  'cleans a deleted identity committed after its sweep through %s',
  async (kind) => {
    const { tag } = await seed();
    const db = createMethods(mongoose);
    let arrive!: () => void;
    let release!: () => void;
    const paused = new Promise<void>((resolve) => {
      arrive = resolve;
    });
    const resume = new Promise<void>((resolve) => {
      release = resolve;
    });
    if (kind === 'bulk') {
      const original = Conversations.collection.bulkWrite.bind(Conversations.collection);
      jest.spyOn(Conversations.collection, 'bulkWrite').mockImplementationOnce(async (...args) => {
        arrive();
        await resume;
        return original(...args);
      });
    } else {
      const original = Conversations.collection.findOneAndUpdate.bind(Conversations.collection);
      jest
        .spyOn(Conversations.collection, 'findOneAndUpdate')
        .mockImplementationOnce(async (...args) => {
          arrive();
          await resume;
          return original(...args);
        });
    }
    const writes = {
      attach: () =>
        methods.createConversationTag('owner', {
          tag: 'old',
          addToConversation: true,
          conversationId: 'convo',
        }),
      save: () =>
        db.saveConvo(
          { userId: 'owner' },
          { conversationId: 'convo', tagIds: [String(tag._id)] },
          { appendMessageIds: [] },
        ),
      bulk: () =>
        db.bulkSaveConvos([{ user: 'owner', conversationId: 'convo', tagIds: [String(tag._id)] }], {
          tagSource: 'owned',
        }),
    };
    const write = writes[kind]();
    await paused;
    await methods.deleteConversationTag('owner', String(tag._id), null, true);
    const replacement = await methods.createConversationTag('owner', { tag: 'old' });
    release();
    await write;
    expect(String(replacement?._id)).not.toBe(String(tag._id));
    expect(await Conversations.findOne({ conversationId: 'convo' }).lean()).toMatchObject({
      tagIds: [],
    });
  },
);

it('resolves import names in bounded bulk operations and keeps bindings across rename', async () => {
  const { tag } = await seed();
  const original = Catalog.collection.bulkWrite.bind(Catalog.collection);
  const bulk = jest
    .spyOn(Catalog.collection, 'bulkWrite')
    .mockImplementationOnce(async (...args) => {
      await methods.updateConversationTag('owner', String(tag._id), { tag: 'renamed' }, null, true);
      return original(...args);
    });
  const find = jest.spyOn(Catalog.collection, 'find');
  const names = ['old', ...Array.from({ length: 600 }, (_, index) => `import-${index}`)];
  const ids = await resolveTagNames(mongoose, 'owner', names);
  expect(ids).toHaveLength(601);
  expect(ids[0]).toBe(String(tag._id));
  expect(bulk).toHaveBeenCalledTimes(2);
  expect(find).toHaveBeenCalledTimes(4);
  expect(await Catalog.countDocuments({ user: 'owner' })).toBe(601);
});

it('binds concurrent import upserts to one identity per name', async () => {
  const names = Array.from({ length: 30 }, (_, index) => `shared-${index}`);
  const [first, second] = await Promise.all([
    resolveTagNames(mongoose, 'owner', names),
    resolveTagNames(mongoose, 'owner', names),
  ]);
  expect(first).toEqual(second);
  expect(await Catalog.countDocuments({ user: 'owner' })).toBe(names.length);
});

it('keeps batched creation and public projection inside the active tenant', async () => {
  await seed('owner', 'tenant-a');
  await tenantStorage.run({ tenantId: 'tenant-a' }, async () => {
    const ids = await resolveTagNames(mongoose, 'owner', ['batch-a', 'batch-b']);
    expect(await Catalog.countDocuments({ tenantId: 'tenant-a', _id: { $in: ids } })).toBe(2);
    await methods.updateTagsForConversation('owner', 'convo', ids, 'tenant-a', true);
    expect(await createMethods(mongoose).getConvoWithTags('owner', 'convo')).toMatchObject({
      tags: ['batch-a', 'batch-b'],
      tagIds: ids,
    });
  });
  await tenantStorage.run({ tenantId: 'tenant-b' }, async () => {
    expect(await createMethods(mongoose).getConvoWithTags('owner', 'convo')).toBeNull();
    const ids = await resolveTagNames(mongoose, 'owner', ['batch-a', 'batch-b']);
    expect(await Catalog.countDocuments({ tenantId: 'tenant-b', _id: { $in: ids } })).toBe(2);
  });
});

it('fails name resolution instead of misaligning IDs when a new label is concurrently renamed', async () => {
  const original = Catalog.collection.bulkWrite.bind(Catalog.collection);
  jest.spyOn(Catalog.collection, 'bulkWrite').mockImplementationOnce(async (...args) => {
    const result = await original(...args);
    await Catalog.updateOne({ user: 'owner', tag: 'first' }, { $set: { tag: 'renamed' } });
    return result;
  });
  await expect(resolveTagNames(mongoose, 'owner', ['first', 'second'])).rejects.toThrow(
    'Tag catalog changed',
  );
});

it('preserves tenant sidebar IDs and hydrates queried full documents in their tenant', async () => {
  await seed('owner', 'tenant-a');
  await tenantStorage.run({ tenantId: 'tenant-a' }, async () => {
    const ids = await resolveTagNames(mongoose, 'owner', ['sidebar label']);
    await methods.updateTagsForConversation('owner', 'convo', ids, 'tenant-a', true);
    const db = createMethods(mongoose);
    const catalogRead = jest.spyOn(Catalog.collection, 'find');
    const sidebar = await db.getConvosByCursor('owner');
    expect(sidebar.conversations).toHaveLength(1);
    expect(sidebar.conversations[0].tagIds).toEqual(ids);
    expect(catalogRead).not.toHaveBeenCalled();
    const queried = await db.getConvosQueried('owner', [{ conversationId: 'convo' }]);
    expect(queried.conversations[0]).toMatchObject({
      tenantId: 'tenant-a',
      tags: ['sidebar label'],
      tagIds: ids,
    });
    expect(queried.convoMap.convo).toBe(queried.conversations[0]);
  });
});
