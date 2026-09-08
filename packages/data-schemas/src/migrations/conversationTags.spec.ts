import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { migrateConversationTags, assertConversationTagMigration } from './conversationTags';
import { createConversationTagMethods } from '~/methods/conversationTag';
import { createConversationTagModel } from '~/models/conversationTag';
import { createConversationModel } from '~/models/convo';

let server: MongoMemoryServer;
const markerId = 'conversation-tag-identity-v1';
const db = () => mongoose.connection.db!;
const marker = () =>
  db()
    .collection<{ _id: string; completedAt: Date }>('schema_migrations')
    .findOne({ _id: markerId });

beforeAll(async () => {
  server = await MongoMemoryServer.create();
  await mongoose.connect(server.getUri(), { monitorCommands: true, autoIndex: false });
  createConversationTagModel(mongoose);
  createConversationModel(mongoose);
});
afterEach(async () => {
  jest.restoreAllMocks();
  await db().dropDatabase();
});
afterAll(async () => {
  await mongoose.disconnect();
  await server.stop();
});

it('initializes an empty database only after creating both required indexes', async () => {
  await assertConversationTagMigration(mongoose.connection);
  expect(await marker()).toHaveProperty('completedAt', expect.any(Date));
  expect(await db().collection('conversations').indexes()).toEqual(
    expect.arrayContaining([expect.objectContaining({ key: { user: 1, tenantId: 1, tagIds: 1 } })]),
  );
  expect(await db().collection('conversationtags').indexes()).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ key: { tag: 1, user: 1, tenantId: 1 }, unique: true }),
    ]),
  );
});

it.each(['conversations', 'conversationtags'])(
  'requires migration for an unmarked database containing %s, even without legacy memberships',
  async (collection) => {
    await db().collection(collection).insertOne({ user: 'owner' });
    await expect(assertConversationTagMigration(mongoose.connection)).rejects.toThrow(
      'migration required',
    );
    expect(await marker()).toBeNull();
  },
);

it('does not mark a dry run and uses only an indexed marker lookup on subsequent startup', async () => {
  await db()
    .collection('conversations')
    .insertOne({ user: 'owner', tags: ['label'] });
  await migrateConversationTags(mongoose.connection);
  expect(await marker()).toBeNull();
  await migrateConversationTags(mongoose.connection, { dryRun: false });
  const commands: string[] = [];
  const listener = (event: { commandName: string }) => commands.push(event.commandName);
  const client = mongoose.connection.getClient();
  client.on('commandStarted', listener);
  try {
    await assertConversationTagMigration(mongoose.connection);
  } finally {
    client.off('commandStarted', listener);
  }
  expect(commands).toEqual(['find']);
  const explain = await db()
    .collection<{ _id: string }>('schema_migrations')
    .find({ _id: markerId })
    .explain('executionStats');
  expect(explain.executionStats.totalDocsExamined).toBe(1);
  expect(explain.executionStats.totalKeysExamined).toBe(1);
});

it('leaves no marker after partial writes and resumes without replacing tag identities', async () => {
  const conversations = db().collection('conversations');
  await conversations.insertMany(
    Array.from({ length: 501 }, () => ({ user: 'owner', tags: ['label'] })),
  );
  const original = conversations.bulkWrite.bind(conversations);
  const write = jest
    .spyOn(Object.getPrototypeOf(conversations) as typeof conversations, 'bulkWrite')
    .mockImplementationOnce((...args) => original(...args))
    .mockRejectedValueOnce(new Error('interrupted batch'));
  await expect(migrateConversationTags(mongoose.connection, { dryRun: false })).rejects.toThrow(
    'interrupted batch',
  );
  write.mockRestore();
  expect(await marker()).toBeNull();
  await expect(assertConversationTagMigration(mongoose.connection)).rejects.toThrow(
    'migration required',
  );
  const tag = await db().collection('conversationtags').findOne({ tag: 'label' });
  await migrateConversationTags(mongoose.connection, { dryRun: false });
  expect(await conversations.countDocuments({ tagIds: [String(tag!._id)] })).toBe(501);
  expect(await db().collection('conversationtags').countDocuments()).toBe(1);
  expect(await marker()).not.toBeNull();
});

it.each([false, true])(
  'leaves startup blocked after index failure (fresh database: %s)',
  async (fresh) => {
    if (!fresh) await db().collection('conversations').insertOne({ user: 'owner', tags: [] });
    const catalog = db().collection('conversationtags');
    const original = catalog.createIndex;
    const index = jest
      .spyOn(Object.getPrototypeOf(catalog) as typeof catalog, 'createIndex')
      .mockImplementation(function (this: typeof catalog, ...args) {
        if (this.collectionName === 'conversationtags')
          return Promise.reject(new Error('index failed'));
        return original.apply(this, args);
      });
    await expect(
      fresh
        ? assertConversationTagMigration(mongoose.connection)
        : migrateConversationTags(mongoose.connection, { dryRun: false }),
    ).rejects.toThrow('index failed');
    expect(await marker()).toBeNull();
    index.mockRestore();
    if (fresh) await assertConversationTagMigration(mongoose.connection);
    else await migrateConversationTags(mongoose.connection, { dryRun: false });
    expect(await marker()).not.toBeNull();
  },
);

it('can retry when the final completion marker write fails', async () => {
  await db()
    .collection('conversations')
    .insertOne({ user: 'owner', tags: ['label'] });
  const markers = db().collection('schema_migrations');
  const original = markers.updateOne;
  const write = jest
    .spyOn(Object.getPrototypeOf(markers) as typeof markers, 'updateOne')
    .mockImplementation(function (this: typeof markers, ...args) {
      if (this.collectionName === 'schema_migrations')
        return Promise.reject(new Error('marker failed'));
      return original.apply(this, args);
    });
  await expect(migrateConversationTags(mongoose.connection, { dryRun: false })).rejects.toThrow(
    'marker failed',
  );
  write.mockRestore();
  expect(await marker()).toBeNull();
  await expect(assertConversationTagMigration(mongoose.connection)).rejects.toThrow(
    'migration required',
  );
  expect(await migrateConversationTags(mongoose.connection, { dryRun: false })).toEqual({
    scanned: 1,
    updated: 0,
    createdTags: 0,
  });
  expect(await marker()).not.toBeNull();
});

it('appends missing tags independently in each owner and tenant scope, preserving existing metadata', async () => {
  const catalog = db().collection('conversationtags');
  const scopes = [
    { user: 'owner' },
    { user: 'other' },
    { user: 'owner', tenantId: 'a' },
    { user: 'owner', tenantId: 'b' },
  ];
  const existing = scopes.map((scope, index) => ({
    _id: new mongoose.Types.ObjectId(),
    ...scope,
    tag: 'existing',
    position: index + 2,
    description: 'preserved',
    createdAt: new Date('2020-01-01'),
    updatedAt: new Date('2020-01-02'),
  }));
  await catalog.insertMany(existing);
  await db()
    .collection('conversations')
    .insertMany(
      scopes.map((scope) => ({ ...scope, tags: ['existing', 'first', 'second', 'first'] })),
    );
  await migrateConversationTags(mongoose.connection, { dryRun: false });
  for (const [index, scope] of scopes.entries()) {
    const rows = await catalog
      .find({ ...scope, tenantId: scope.tenantId ?? { $exists: false } })
      .sort({ position: 1 })
      .toArray();
    expect(rows.map((row) => [row.tag, row.position])).toEqual([
      ['existing', index + 2],
      ['first', index + 3],
      ['second', index + 4],
    ]);
    expect(rows[0]).toEqual(existing[index]);
  }
});

it('resumes partial catalog insertion without changing committed positions or IDs', async () => {
  const catalog = db().collection('conversationtags');
  await catalog.insertOne({ user: 'owner', tag: 'existing', position: 4 });
  await db()
    .collection('conversations')
    .insertOne({ user: 'owner', tags: ['first', 'second'] });
  const original = catalog.updateOne;
  let inserts = 0;
  const write = jest
    .spyOn(Object.getPrototypeOf(catalog) as typeof catalog, 'updateOne')
    .mockImplementation(function (this: typeof catalog, ...args) {
      if (this.collectionName === 'conversationtags' && ++inserts === 2)
        return Promise.reject(new Error('catalog interrupted'));
      return original.apply(this, args);
    });
  await expect(migrateConversationTags(mongoose.connection, { dryRun: false })).rejects.toThrow(
    'catalog interrupted',
  );
  write.mockRestore();
  const first = await catalog.findOne({ user: 'owner', tag: 'first' });
  expect(first?.position).toBe(5);
  expect(await marker()).toBeNull();
  await migrateConversationTags(mongoose.connection, { dryRun: false });
  expect(await catalog.findOne({ _id: first!._id })).toEqual(first);
  expect((await catalog.findOne({ user: 'owner', tag: 'second' }))?.position).toBe(6);
});

it('supports reorder and deletion after migrating several missing catalog names', async () => {
  await db()
    .collection('conversations')
    .insertOne({ user: 'owner', tags: ['first', 'second', 'third'] });
  await migrateConversationTags(mongoose.connection, { dryRun: false });
  const methods = createConversationTagMethods(mongoose);
  const catalog = db().collection('conversationtags');
  const third = await catalog.findOne({ user: 'owner', tag: 'third' });
  await methods.updateConversationTag('owner', String(third!._id), { position: 0 }, null, true);
  expect(
    (await methods.getConversationTags('owner', null)).map((row) => [row.tag, row.position]),
  ).toEqual([
    ['third', 0],
    ['first', 1],
    ['second', 2],
  ]);
  const first = await catalog.findOne({ user: 'owner', tag: 'first' });
  await methods.deleteConversationTag('owner', String(first!._id), null, true);
  expect(
    (await methods.getConversationTags('owner', null)).map((row) => [row.tag, row.position]),
  ).toEqual([
    ['third', 0],
    ['second', 1],
  ]);
});

it.each([-1, 0.5, null, '1'])(
  'rejects invalid catalog position %s before writing',
  async (position) => {
    await db()
      .collection('conversationtags')
      .insertOne({ user: 'owner', tag: 'existing', position });
    await db()
      .collection('conversations')
      .insertOne({ user: 'owner', tags: ['new'] });
    await expect(migrateConversationTags(mongoose.connection, { dryRun: false })).rejects.toThrow(
      'invalid catalog position',
    );
    expect(await db().collection('conversationtags').countDocuments()).toBe(1);
    expect(await marker()).toBeNull();
  },
);

it('uses the schema default for absent legacy positions and refuses exhausted position ranges', async () => {
  const catalog = db().collection('conversationtags');
  await catalog.insertOne({ user: 'owner', tag: 'existing' });
  await db()
    .collection('conversations')
    .insertOne({ user: 'owner', tags: ['new'] });
  await migrateConversationTags(mongoose.connection, { dryRun: false });
  expect((await catalog.findOne({ user: 'owner', tag: 'new' }))?.position).toBe(1);
  expect(await catalog.findOne({ user: 'owner', tag: 'existing' })).not.toHaveProperty('position');
  await catalog.insertOne({ user: 'other', tag: 'existing', position: Number.MAX_SAFE_INTEGER });
  await db()
    .collection('conversations')
    .insertOne({ user: 'other', tags: ['overflow'] });
  await expect(migrateConversationTags(mongoose.connection, { dryRun: false })).rejects.toThrow(
    'cannot allocate a safe catalog position',
  );
  expect(await catalog.findOne({ user: 'other', tag: 'overflow' })).toBeNull();
});
