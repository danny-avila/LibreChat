import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { IMemoryEntry } from '~/types';
import { createMemoryMethods, type MemoryMethods } from './memory';
import { createModels } from '~/models';

jest.mock('~/config/winston', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}));

let mongoServer: InstanceType<typeof MongoMemoryServer>;
let MemoryEntry: mongoose.Model<IMemoryEntry>;
let methods: MemoryMethods;

const userId = new mongoose.Types.ObjectId();
const otherUserId = new mongoose.Types.ObjectId();
const agentId = 'agent_partition_a';
const otherAgentId = 'agent_partition_b';
const chatProjectId = 'project_partition_a';
const otherChatProjectId = 'project_partition_b';

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  createModels(mongoose);
  MemoryEntry = mongoose.models.MemoryEntry as mongoose.Model<IMemoryEntry>;
  methods = createMemoryMethods(mongoose);
  await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await MemoryEntry.deleteMany({});
});

describe('memory partitions', () => {
  it('writes to the shared personal pool when agentId is omitted', async () => {
    await methods.setMemory({ userId, key: 'preference', value: 'likes tea', tokenCount: 3 });

    const personal = await methods.getUserMemories({ userId });
    expect(personal).toHaveLength(1);
    expect(personal[0].agentId == null).toBe(true);

    const agentScoped = await methods.getUserMemories({ userId, agentId });
    expect(agentScoped).toHaveLength(0);
  });

  it('isolates the same key across partitions', async () => {
    await methods.setMemory({ userId, key: 'context', value: 'personal', tokenCount: 1 });
    await methods.setMemory({ userId, key: 'context', value: 'agent a', tokenCount: 2, agentId });
    await methods.setMemory({
      userId,
      key: 'context',
      value: 'agent b',
      tokenCount: 3,
      agentId: otherAgentId,
    });

    const personal = await methods.getUserMemories({ userId });
    const partitionA = await methods.getUserMemories({ userId, agentId });
    const partitionB = await methods.getUserMemories({ userId, agentId: otherAgentId });

    expect(personal.map((m) => m.value)).toEqual(['personal']);
    expect(partitionA.map((m) => m.value)).toEqual(['agent a']);
    expect(partitionB.map((m) => m.value)).toEqual(['agent b']);
    expect(await MemoryEntry.countDocuments({ userId })).toBe(3);
  });

  it('upserts within a partition instead of duplicating', async () => {
    await methods.setMemory({ userId, key: 'context', value: 'first', tokenCount: 1, agentId });
    await methods.setMemory({ userId, key: 'context', value: 'second', tokenCount: 2, agentId });

    const partitionA = await methods.getUserMemories({ userId, agentId });
    expect(partitionA).toHaveLength(1);
    expect(partitionA[0].value).toBe('second');
  });

  it('treats legacy entries without an agentId field as the personal pool', async () => {
    await MemoryEntry.collection.insertOne({
      userId,
      key: 'legacy',
      value: 'pre-partition entry',
      tokenCount: 4,
      updated_at: new Date(),
    });

    const personal = await methods.getUserMemories({ userId });
    expect(personal.map((m) => m.key)).toEqual(['legacy']);

    await methods.setMemory({ userId, key: 'legacy', value: 'updated', tokenCount: 4 });
    expect(await MemoryEntry.countDocuments({ userId })).toBe(1);
    expect((await methods.getUserMemories({ userId }))[0].value).toBe('updated');
  });

  it('deletes only within the targeted partition', async () => {
    await methods.setMemory({ userId, key: 'context', value: 'personal', tokenCount: 1 });
    await methods.setMemory({ userId, key: 'context', value: 'agent a', tokenCount: 2, agentId });

    const agentDelete = await methods.deleteMemory({ userId, key: 'context', agentId });
    expect(agentDelete.ok).toBe(true);
    expect(await methods.getUserMemories({ userId })).toHaveLength(1);
    expect(await methods.getUserMemories({ userId, agentId })).toHaveLength(0);

    const missingDelete = await methods.deleteMemory({ userId, key: 'context', agentId });
    expect(missingDelete.ok).toBe(false);
  });

  it('scopes createMemory duplicate detection to the partition', async () => {
    await methods.createMemory({ userId, key: 'context', value: 'personal', tokenCount: 1 });

    await expect(
      methods.createMemory({ userId, key: 'context', value: 'dupe', tokenCount: 1 }),
    ).rejects.toThrow('already exists');

    const created = await methods.createMemory({
      userId,
      key: 'context',
      value: 'agent a',
      tokenCount: 2,
      agentId,
    });
    expect(created.ok).toBe(true);
  });

  it('formats memories per partition with partition-scoped totals', async () => {
    await methods.setMemory({ userId, key: 'one', value: 'personal one', tokenCount: 5 });
    await methods.setMemory({ userId, key: 'two', value: 'agent two', tokenCount: 7, agentId });

    const personal = await methods.getFormattedMemories({ userId });
    expect(personal.totalTokens).toBe(5);
    expect(personal.withoutKeys).toContain('personal one');
    expect(personal.withoutKeys).not.toContain('agent two');

    const partitionA = await methods.getFormattedMemories({ userId, agentId });
    expect(partitionA.totalTokens).toBe(7);
    expect(partitionA.withKeys).toContain('"key": "two"');
    expect(partitionA.withKeys).not.toContain('personal one');
  });

  it('returns every partition from getAllUserMemories and wipes them all on deleteAllUserMemories', async () => {
    await methods.setMemory({ userId, key: 'one', value: 'personal', tokenCount: 1 });
    await methods.setMemory({ userId, key: 'two', value: 'agent a', tokenCount: 1, agentId });
    await methods.setMemory({ userId: otherUserId, key: 'three', value: 'other', tokenCount: 1 });

    const all = await methods.getAllUserMemories(userId);
    expect(all).toHaveLength(2);

    const deleted = await methods.deleteAllUserMemories(userId);
    expect(deleted).toBe(2);
    expect(await MemoryEntry.countDocuments({ userId: otherUserId })).toBe(1);
  });
});

describe('chat project partitions', () => {
  it('keeps a project partition out of the shared personal pool', async () => {
    await methods.setMemory({ userId, key: 'context', value: 'personal', tokenCount: 1 });
    await methods.setMemory({
      userId,
      key: 'context',
      value: 'project',
      tokenCount: 2,
      chatProjectId,
    });

    expect((await methods.getUserMemories({ userId })).map((m) => m.value)).toEqual(['personal']);
    expect((await methods.getUserMemories({ userId, chatProjectId })).map((m) => m.value)).toEqual([
      'project',
    ]);
  });

  it('isolates one project from another', async () => {
    await methods.setMemory({ userId, key: 'goal', value: 'project a', chatProjectId });
    await methods.setMemory({
      userId,
      key: 'goal',
      value: 'project b',
      chatProjectId: otherChatProjectId,
    });

    expect((await methods.getUserMemories({ userId, chatProjectId })).map((m) => m.value)).toEqual([
      'project a',
    ]);
    expect(
      (await methods.getUserMemories({ userId, chatProjectId: otherChatProjectId })).map(
        (m) => m.value,
      ),
    ).toEqual(['project b']);
  });

  it('composes with the agent partition instead of overriding it', async () => {
    await methods.setMemory({ userId, key: 'context', value: 'project only', chatProjectId });
    await methods.setMemory({
      userId,
      key: 'context',
      value: 'agent in project',
      agentId,
      chatProjectId,
    });

    expect((await methods.getUserMemories({ userId, chatProjectId })).map((m) => m.value)).toEqual([
      'project only',
    ]);
    expect(
      (await methods.getUserMemories({ userId, agentId, chatProjectId })).map((m) => m.value),
    ).toEqual(['agent in project']);
    expect(await methods.getUserMemories({ userId, agentId })).toHaveLength(0);
  });

  it('treats entries without a chatProjectId field as the personal pool', async () => {
    await MemoryEntry.collection.insertOne({
      userId,
      key: 'legacy',
      value: 'pre-partition entry',
      tokenCount: 4,
      updated_at: new Date(),
    });

    expect((await methods.getUserMemories({ userId })).map((m) => m.key)).toEqual(['legacy']);
    expect(await methods.getUserMemories({ userId, chatProjectId })).toHaveLength(0);
  });

  it('scopes formatted memories and their totals to the project', async () => {
    await methods.setMemory({ userId, key: 'one', value: 'personal one', tokenCount: 5 });
    await methods.setMemory({
      userId,
      key: 'two',
      value: 'project two',
      tokenCount: 7,
      chatProjectId,
    });

    const personal = await methods.getFormattedMemories({ userId });
    expect(personal.totalTokens).toBe(5);
    expect(personal.withoutKeys).not.toContain('project two');

    const project = await methods.getFormattedMemories({ userId, chatProjectId });
    expect(project.totalTokens).toBe(7);
    expect(project.withKeys).toContain('"key": "two"');
    expect(project.withKeys).not.toContain('personal one');
  });

  it('deletes only the targeted project, for the targeted user', async () => {
    await methods.setMemory({ userId, key: 'one', value: 'personal', tokenCount: 1 });
    await methods.setMemory({ userId, key: 'two', value: 'project a', chatProjectId });
    await methods.setMemory({
      userId,
      key: 'three',
      value: 'agent in project a',
      agentId,
      chatProjectId,
    });
    await methods.setMemory({
      userId,
      key: 'four',
      value: 'project b',
      chatProjectId: otherChatProjectId,
    });
    await methods.setMemory({
      userId: otherUserId,
      key: 'five',
      value: 'other user',
      chatProjectId,
    });

    const deleted = await methods.deleteProjectMemories({ userId, chatProjectId });

    expect(deleted).toBe(2);
    expect(await methods.getUserMemories({ userId })).toHaveLength(1);
    expect(
      await methods.getUserMemories({ userId, chatProjectId: otherChatProjectId }),
    ).toHaveLength(1);
    expect(await MemoryEntry.countDocuments({ userId: otherUserId })).toBe(1);
  });
});
