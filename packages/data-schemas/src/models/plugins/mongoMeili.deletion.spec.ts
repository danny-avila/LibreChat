import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { createConversationTagModel } from '~/models/conversationTag';
import { tenantStorage } from '~/config/tenantContext';

const mockDeleteDocument = jest.fn();
const mockDeleteDocuments = jest.fn();
const mockAddDocuments = jest.fn();
const mockWaitForTask = jest.fn();
const mockIndex = {
  getRawInfo: jest.fn().mockResolvedValue({}),
  updateSettings: jest.fn().mockResolvedValue({}),
  addDocuments: mockAddDocuments,
  deleteDocument: mockDeleteDocument,
  deleteDocuments: mockDeleteDocuments,
};
jest.mock('meilisearch', () => ({
  MeiliSearch: jest.fn().mockImplementation(() => ({
    index: jest.fn().mockReturnValue(mockIndex),
    waitForTask: mockWaitForTask,
  })),
}));

const waitUntil = async (check: () => boolean) => {
  const deadline = Date.now() + 4000;
  while (!check() && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  expect(check()).toBe(true);
};

describe('catalog Meili deletion hooks', () => {
  const originalEnv = { ...process.env };
  let server: MongoMemoryServer;
  let Tag: ReturnType<typeof createConversationTagModel>;

  beforeAll(async () => {
    process.env.SEARCH = 'true';
    process.env.MEILI_HOST = 'http://meili.test';
    process.env.MEILI_MASTER_KEY = 'test-key';
    const { createConversationTagModel } = await import('~/models/conversationTag');
    server = await MongoMemoryServer.create();
    await mongoose.connect(server.getUri());
    Tag = createConversationTagModel(mongoose);
  });

  beforeEach(() => {
    mockDeleteDocument.mockReset().mockResolvedValue({ taskUid: 2 });
    mockDeleteDocuments.mockReset().mockResolvedValue({ taskUid: 2 });
    mockAddDocuments.mockReset().mockResolvedValue({ taskUid: 1 });
    mockWaitForTask.mockReset().mockResolvedValue({ status: 'succeeded' });
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await server.stop();
    process.env = originalEnv;
  });

  test('deletes the configured ObjectId key from a lean findOneAndDelete result', async () => {
    const [tag] = await Tag.insertMany([{ user: 'lean', tag: 'Label', position: 0 }]);
    const deleted = await Tag.findOneAndDelete({ _id: tag._id }).lean();
    expect(deleted?._id).toEqual(tag._id);
    await waitUntil(() => mockDeleteDocument.mock.calls.length === 1);
    expect(mockDeleteDocument).toHaveBeenCalledWith(String(tag._id));
    expect(mockWaitForTask).toHaveBeenCalledWith(2, expect.any(Object));
  });

  test('queues deletion behind a pending versioned write and removes the late snapshot', async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    mockWaitForTask.mockImplementation(async (taskUid: number) => {
      if (taskUid === 1) await pending;
      return { status: 'succeeded' };
    });
    const tag = await Tag.create({ user: 'pending', tag: 'Pending', position: 0 });
    await waitUntil(() => mockAddDocuments.mock.calls.length === 1);
    await Tag.findOneAndDelete({ _id: tag._id }).lean();
    release();
    await waitUntil(() => mockDeleteDocument.mock.calls.length >= 2);
    expect(mockDeleteDocument.mock.calls.every(([id]) => id === String(tag._id))).toBe(true);
    expect(await Tag.exists({ _id: tag._id })).toBeNull();
  });

  test('deletes only the matched catalog keys in bounded batches after deleteMany', async () => {
    const tags = await Tag.insertMany(
      Array.from({ length: 205 }, (_, i) => ({
        user: 'bulk',
        tag: `Bulk ${i}`,
        position: i,
      })),
    );
    const [retained] = await Tag.insertMany([{ user: 'retained', tag: 'Keep', position: 0 }]);
    await Tag.deleteMany({ user: 'bulk' });
    await waitUntil(() => mockDeleteDocuments.mock.calls.length === 3);
    expect(mockDeleteDocuments.mock.calls.flatMap(([ids]) => ids).sort()).toEqual(
      tags.map((tag) => String(tag._id)).sort(),
    );
    expect(mockDeleteDocuments.mock.calls.every(([ids]) => ids.length <= 100)).toBe(true);
    expect(await Tag.exists({ _id: retained._id })).not.toBeNull();
  });

  test('retains tenant scope through detached bulk cleanup', async () => {
    const [removed] = await tenantStorage.run({ tenantId: 'tenant-a' }, async () =>
      Tag.insertMany([{ user: 'same-user', tag: 'Scoped', position: 0 }]),
    );
    const [retained] = await tenantStorage.run({ tenantId: 'tenant-b' }, async () =>
      Tag.insertMany([{ user: 'same-user', tag: 'Scoped', position: 0 }]),
    );
    await tenantStorage.run({ tenantId: 'tenant-a' }, async () => {
      await Tag.deleteMany({ user: 'same-user' });
    });
    await waitUntil(() => mockDeleteDocuments.mock.calls.length === 1);
    expect(mockDeleteDocuments).toHaveBeenCalledWith([String(removed._id)]);
    expect(await Tag.exists({ _id: retained._id })).not.toBeNull();
  });

  test('does not enqueue cleanup when the Mongo bulk deletion fails', async () => {
    const [tag] = await Tag.insertMany([{ user: 'failed-bulk', tag: 'Keep', position: 0 }]);
    jest.spyOn(Tag.collection, 'deleteMany').mockRejectedValueOnce(new Error('Mongo unavailable'));
    await expect(Tag.deleteMany({ _id: tag._id })).rejects.toThrow('Mongo unavailable');
    expect(mockDeleteDocuments).not.toHaveBeenCalled();
    expect(await Tag.exists({ _id: tag._id })).not.toBeNull();
  });

  test('does not send an undefined key when a caller excludes the primary key', async () => {
    const [tag] = await Tag.insertMany([{ user: 'projection', tag: 'Hidden ID', position: 0 }]);
    await Tag.findOneAndDelete({ _id: tag._id }).select({ _id: 0 }).lean();
    expect(mockDeleteDocument).not.toHaveBeenCalled();
  });

  test('retries an external deletion failure after Mongo deletion commits', async () => {
    mockDeleteDocument.mockRejectedValueOnce(new Error('Meili unavailable'));
    const [tag] = await Tag.insertMany([{ user: 'retry', tag: 'Retry', position: 0 }]);
    await Tag.findOneAndDelete({ _id: tag._id }).lean();
    await waitUntil(() => mockDeleteDocument.mock.calls.length === 2);
    expect(await Tag.exists({ _id: tag._id })).toBeNull();
    expect(mockDeleteDocument).toHaveBeenLastCalledWith(String(tag._id));
  });
});
