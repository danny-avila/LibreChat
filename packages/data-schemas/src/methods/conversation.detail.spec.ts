import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createConversationMethods } from './conversation';
import { tenantStorage } from '~/config/tenantContext';
import { createModels } from '~/models';

let server: MongoMemoryServer;
let methods: ReturnType<typeof createConversationMethods>;
const db = () => mongoose.connection.db!;
beforeAll(async () => {
  server = await MongoMemoryServer.create();
  await mongoose.connect(server.getUri(), { autoIndex: false });
  createModels(mongoose);
  methods = createConversationMethods(mongoose);
});
afterEach(async () => {
  await db().collection('conversations').deleteMany({});
  await db().collection('conversationtags').deleteMany({});
});
afterAll(async () => {
  await mongoose.disconnect();
  await server.stop();
});

it('preserves every schema-hidden field exclusion and exposes no lookup helpers', async () => {
  const Conversation = mongoose.models.Conversation;
  const hidden: Record<string, string> = {};
  Conversation.schema.eachPath((path, schemaType) => {
    if (schemaType.options.select === false) hidden[path] = 'private';
  });
  expect(Object.keys(hidden).length).toBeGreaterThan(0);
  await db()
    .collection('conversations')
    .insertOne({ user: 'owner', conversationId: 'detail', title: 'Visible', ...hidden });
  const selected = await Conversation.findOne({ user: 'owner', conversationId: 'detail' }).lean();
  expect(await methods.getConvoWithTags('owner', 'detail')).toEqual({
    ...selected,
    tags: [],
    tagIds: [],
  });
});

it('keeps exact owner and tenant scope while dropping foreign, malformed and dangling references', async () => {
  const own = new mongoose.Types.ObjectId();
  const other = new mongoose.Types.ObjectId();
  const foreign = new mongoose.Types.ObjectId();
  const tenantless = new mongoose.Types.ObjectId();
  await db()
    .collection('conversationtags')
    .insertMany([
      { _id: own, user: 'owner', tenantId: 'a', tag: 'Owned' },
      { _id: other, user: 'other', tenantId: 'a', tag: 'Other owner' },
      { _id: foreign, user: 'owner', tenantId: 'b', tag: 'Other tenant' },
      { _id: tenantless, user: 'owner', tag: 'Tenantless' },
    ]);
  await db()
    .collection('conversations')
    .insertOne({
      user: 'owner',
      tenantId: 'a',
      conversationId: 'detail',
      tagIds: [
        String(other),
        String(own),
        String(foreign),
        'invalid',
        String(new mongoose.Types.ObjectId()),
        String(own),
        String(tenantless),
      ],
    });
  await tenantStorage.run({ tenantId: 'a' }, async () => {
    expect(await methods.getConvoWithTags('owner', 'detail')).toMatchObject({
      tags: ['Owned'],
      tagIds: [String(own)],
    });
    expect(await methods.getConvoWithTags('other', 'detail')).toBeNull();
  });
  await tenantStorage.run({ tenantId: 'b' }, async () => {
    expect(await methods.getConvoWithTags('owner', 'detail')).toBeNull();
  });
  expect(await methods.getConvoWithTags('owner', 'detail')).toBeNull();
});

it.each([undefined, [], ['invalid'], 'malformed'])(
  'handles untagged or invalid stored membership %s',
  async (tagIds) => {
    await db()
      .collection('conversations')
      .insertOne({
        user: 'owner',
        conversationId: 'detail',
        ...(tagIds === undefined ? {} : { tagIds }),
      });
    expect(await methods.getConvoWithTags('owner', 'detail')).toMatchObject({
      tags: [],
      tagIds: [],
    });
    expect(await methods.getConvoWithTags('owner', 'missing')).toBeNull();
  },
);

it('joins only referenced IDs from a large catalog using the foreign primary-key index', async () => {
  const catalog = Array.from({ length: 10000 }, (_, index) => ({
    _id: new mongoose.Types.ObjectId(),
    user: 'owner',
    tag: `label-${index}`,
  }));
  await db().collection('conversationtags').insertMany(catalog);
  const ids = [String(catalog[9000]._id), String(catalog[2]._id)];
  await db()
    .collection('conversations')
    .insertOne({ user: 'owner', conversationId: 'detail', tagIds: ids });
  const Conversation = mongoose.models.Conversation;
  const aggregate = jest.spyOn(Conversation.collection, 'aggregate');
  const find = jest.spyOn(mongoose.models.ConversationTag.collection, 'find');
  expect(await methods.getConvoWithTags('owner', 'detail')).toMatchObject({
    tags: ['label-9000', 'label-2'],
    tagIds: ids,
  });
  expect(aggregate).toHaveBeenCalledTimes(1);
  expect(find).not.toHaveBeenCalled();
  const pipeline = aggregate.mock.calls[0][0]!;
  expect(pipeline).toContainEqual({ $limit: 1 });
  expect(pipeline.find((stage) => '$lookup' in stage)).toEqual({
    $lookup: {
      from: 'conversationtags',
      localField: '__tagLookupIds',
      foreignField: '_id',
      as: '__tagCatalog',
    },
  });
  const explanation = await Conversation.collection.aggregate(pipeline).explain('executionStats');
  const lookup = explanation.stages.find((stage: { $lookup?: object }) => stage.$lookup);
  expect(lookup.indexesUsed).toContain('_id_');
  expect(lookup.totalDocsExamined).toBe(2);
});

it('preserves existing expiration and child-record admission while reflecting catalog changes', async () => {
  const id = new mongoose.Types.ObjectId();
  await db().collection('conversationtags').insertOne({ _id: id, user: 'owner', tag: 'old' });
  const expiredAt = new Date('2020-01-01');
  await db()
    .collection('conversations')
    .insertOne({
      user: 'owner',
      conversationId: 'detail',
      expiredAt,
      subagentThread: { parentConversationId: 'parent' },
      tagIds: [String(id)],
    });
  expect(await methods.getConvoWithTags('owner', 'detail')).toMatchObject({
    expiredAt,
    subagentThread: { parentConversationId: 'parent' },
    tags: ['old'],
  });
  await db()
    .collection('conversationtags')
    .updateOne({ _id: id }, { $set: { tag: 'new' } });
  expect(await methods.getConvoWithTags('owner', 'detail')).toMatchObject({ tags: ['new'] });
  await db().collection('conversationtags').deleteOne({ _id: id });
  expect(await methods.getConvoWithTags('owner', 'detail')).toMatchObject({ tags: [], tagIds: [] });
});
