import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { MeiliBulkInsertMethods } from './mongoMeili';
import { resolveTagNames } from '~/tags/membership';

const mockAdd = jest.fn();
const mockDelete = jest.fn();
const mockWait = jest.fn();
jest.mock('meilisearch', () => ({
  MeiliSearch: jest.fn().mockImplementation(() => ({
    index: () => ({
      getRawInfo: jest.fn(),
      updateSettings: jest.fn(),
      addDocuments: mockAdd,
      updateDocuments: mockAdd,
      deleteDocument: mockDelete,
    }),
    waitForTask: mockWait,
  })),
}));
let server: MongoMemoryServer;
let pendingBatches: Promise<void>[] = [];
let Tag: ReturnType<(typeof import('~/models/conversationTag'))['createConversationTagModel']>;
const oldEnv = {
  SEARCH: process.env.SEARCH,
  MEILI_HOST: process.env.MEILI_HOST,
  MEILI_MASTER_KEY: process.env.MEILI_MASTER_KEY,
};
const waitUntil = async (condition: () => Promise<boolean>, timeout = 5000) => {
  const start = Date.now();
  while (!(await condition())) {
    if (Date.now() - start > timeout) throw new Error('Timed out waiting for indexing');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};
beforeAll(async () => {
  process.env.SEARCH = 'true';
  process.env.MEILI_HOST = 'test';
  process.env.MEILI_MASTER_KEY = 'test';
  const { createConversationTagModel } = await import('~/models/conversationTag');
  server = await MongoMemoryServer.create();
  await mongoose.connect(server.getUri());
  Tag = createConversationTagModel(mongoose);
});
beforeEach(async () => {
  pendingBatches = [];
  const indexedTag = Tag as typeof Tag & MeiliBulkInsertMethods;
  const queue = indexedTag.queueMeiliDocuments.bind(indexedTag);
  jest.spyOn(indexedTag, 'queueMeiliDocuments').mockImplementation((rows) => {
    const pending = queue(rows);
    pendingBatches.push(pending);
    return pending;
  });
  await Tag.collection.deleteMany({});
  mockAdd.mockReset().mockResolvedValue({ taskUid: 1 });
  mockDelete.mockReset().mockResolvedValue({ taskUid: 1 });
  mockWait.mockReset().mockResolvedValue({ status: 'succeeded' });
});
afterEach(async () => {
  await Promise.all(pendingBatches);
});
afterAll(async () => {
  await mongoose.disconnect();
  await server.stop();
  for (const [key, value] of Object.entries(oldEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});
const acknowledged = async (count: number) =>
  (await Tag.collection.countDocuments({ _meiliIndex: true })) === count;

it('indexes bulk-created labels with bounded foreground reads and bounded background concurrency', async () => {
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  mockWait.mockImplementation(async () => {
    await blocked;
    return { status: 'succeeded' };
  });
  const find = jest.spyOn(Tag.collection, 'find');
  try {
    const ids = await resolveTagNames(
      mongoose,
      'owner',
      Array.from({ length: 501 }, (_, i) => `label-${i}`),
    );
    expect(ids).toHaveLength(501);
    expect(find).toHaveBeenCalledTimes(4);
    await waitUntil(async () => mockAdd.mock.calls.length === 100);
    expect(mockAdd).toHaveBeenCalledTimes(100);
  } finally {
    release();
  }
  await waitUntil(() => acknowledged(501));
  expect(mockAdd).toHaveBeenCalledTimes(501);
});

it('dispatches successful partial inserts while preserving the original bulk failure', async () => {
  const original = Tag.collection.bulkWrite.bind(Tag.collection);
  const failure = new Error('ordered write failed');
  jest.spyOn(Tag.collection, 'bulkWrite').mockImplementationOnce(async (ops, options) => {
    await original(ops.slice(0, 1), options);
    throw failure;
  });
  await expect(resolveTagNames(mongoose, 'owner', ['first', 'second'])).rejects.toBe(failure);
  await waitUntil(() => acknowledged(1));
  expect(mockAdd.mock.calls[0][0][0]).toMatchObject({ tag: 'first', user: 'owner' });
});

it('retains the concurrent upsert winner and indexes its persisted version', async () => {
  const names = ['first', 'second'];
  const [a, b] = await Promise.all([
    resolveTagNames(mongoose, 'owner', names),
    resolveTagNames(mongoose, 'owner', names),
  ]);
  expect(a).toEqual(b);
  await waitUntil(() => acknowledged(2));
});

it.each(['rename', 'delete'])(
  'reconciles a concurrent %s while a bulk indexing task is pending',
  async (operation) => {
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    mockWait.mockImplementationOnce(async () => {
      await blocked;
      return { status: 'succeeded' };
    });
    let id: string;
    try {
      [id] = await resolveTagNames(mongoose, 'owner', ['original']);
      await waitUntil(async () => mockAdd.mock.calls.length > 0);
      if (operation === 'rename')
        await Tag.findOneAndUpdate({ _id: id }, { tag: 'renamed' }, { new: true });
      else await Tag.findOneAndDelete({ _id: id });
    } finally {
      release();
    }
    if (operation === 'rename') {
      await waitUntil(() => acknowledged(1));
      expect(mockAdd.mock.calls[mockAdd.mock.calls.length - 1]?.[0][0]).toMatchObject({
        tag: 'renamed',
      });
    } else {
      await waitUntil(async () => mockDelete.mock.calls.length > 0);
      expect(mockDelete).toHaveBeenCalledWith(id);
    }
  },
);

it('retries transient search failure without failing name resolution', async () => {
  mockAdd.mockRejectedValueOnce(new Error('search unavailable'));
  await resolveTagNames(mongoose, 'owner', ['retry']);
  await waitUntil(() => acknowledged(1));
  expect(mockAdd).toHaveBeenCalledTimes(2);
});

it('retains pending flags after retry exhaustion', async () => {
  mockAdd.mockRejectedValue(new Error('search unavailable'));
  await resolveTagNames(mongoose, 'owner', ['pending']);
  await waitUntil(async () => mockAdd.mock.calls.length === 3);
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(await Tag.collection.findOne({ tag: 'pending' })).toMatchObject({
    _meiliIndex: false,
    _meiliIndexAttempted: true,
  });
});
