import { MongoClient } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';

import type { MCPAuthorityConsistencyFence } from './consistency';
import { createMCPAuthorityConsistencyModule } from './consistency';

interface Deferred {
  readonly promise: Promise<void>;
  readonly resolve: () => void;
}

function createDeferred(): Deferred {
  let resolvePromise: (() => void) | undefined;
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve;
  });
  return {
    promise,
    resolve: () => resolvePromise?.(),
  };
}

describe('Mongo-wire MCP authority consistency', () => {
  let server: MongoMemoryServer;
  let client: MongoClient;

  beforeAll(async () => {
    server = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1' } });
    client = new MongoClient(server.getUri());
    await client.connect();
  });

  afterAll(async () => {
    await client?.close();
    await server?.stop();
  });

  beforeEach(async () => {
    await client.db('authority').dropDatabase();
  });

  test('initializes one clean global authority generation', async () => {
    const consistency = createMCPAuthorityConsistencyModule({
      collection: client.db('authority').collection<MCPAuthorityConsistencyFence>('consistency'),
      now: () => new Date('2026-08-07T12:00:00.000Z'),
      createOwnerId: () => 'owner-1',
    });

    await expect(consistency.initializeMCPAuthorityConsistency()).resolves.toEqual({
      generation: 0,
    });
    await expect(consistency.initializeMCPAuthorityConsistency()).resolves.toEqual({
      generation: 0,
    });
  });

  test('returns plain reads only when one clean generation brackets them', async () => {
    const database = client.db('authority');
    const consistency = createMCPAuthorityConsistencyModule({
      collection: database.collection<MCPAuthorityConsistencyFence>('consistency'),
      now: () => new Date('2026-08-07T12:00:00.000Z'),
      createOwnerId: () => 'owner-1',
    });
    const values = database.collection<{ _id: string; value: string }>('values');
    await values.insertOne({ _id: 'selected', value: 'before' });
    await consistency.initializeMCPAuthorityConsistency();

    await expect(
      consistency.readStableSnapshot(async () => await values.findOne({ _id: 'selected' })),
    ).resolves.toEqual({
      generation: 0,
      snapshot: { _id: 'selected', value: 'before' },
    });
  });

  test('asserts the exact clean authority generation', async () => {
    const consistency = createMCPAuthorityConsistencyModule({
      collection: client.db('authority').collection<MCPAuthorityConsistencyFence>('consistency'),
      now: () => new Date('2026-08-07T12:00:00.000Z'),
      createOwnerId: () => 'owner-1',
    });
    await consistency.initializeMCPAuthorityConsistency();

    await expect(consistency.assertGeneration(0)).resolves.toBeUndefined();
    await expect(consistency.assertGeneration(1)).rejects.toEqual(
      expect.objectContaining({ reason: 'generation_changed' }),
    );
  });

  test('publishes a mutation by advancing the global generation once', async () => {
    const database = client.db('authority');
    const consistency = createMCPAuthorityConsistencyModule({
      collection: database.collection<MCPAuthorityConsistencyFence>('consistency'),
      now: () => new Date('2026-08-07T12:00:00.000Z'),
      createOwnerId: () => 'owner-1',
    });
    const values = database.collection<{ _id: string; value: string }>('values');
    await values.insertOne({ _id: 'selected', value: 'before' });
    await consistency.initializeMCPAuthorityConsistency();

    await expect(
      consistency.mutateMCPAuthority(async () => {
        await values.updateOne({ _id: 'selected' }, { $set: { value: 'after' } });
        return 'written';
      }),
    ).resolves.toEqual({ generation: 1, result: 'written' });
    await expect(
      consistency.readStableSnapshot(async () => await values.findOne({ _id: 'selected' })),
    ).resolves.toEqual({
      generation: 1,
      snapshot: { _id: 'selected', value: 'after' },
    });
    await expect(consistency.assertGeneration(0)).rejects.toEqual(
      expect.objectContaining({ reason: 'generation_changed' }),
    );
  });

  test('initializes the authority generation when the first operation is a mutation', async () => {
    const consistency = createMCPAuthorityConsistencyModule({
      collection: client.db('authority').collection<MCPAuthorityConsistencyFence>('consistency'),
      now: () => new Date('2026-08-07T12:00:00.000Z'),
      createOwnerId: () => 'owner-1',
    });

    await expect(consistency.mutateMCPAuthority(async () => 'written')).resolves.toEqual({
      generation: 1,
      result: 'written',
    });
  });

  test('fails closed after an authority mutation throws', async () => {
    const database = client.db('authority');
    const wait = jest.fn(async () => undefined);
    const consistency = createMCPAuthorityConsistencyModule({
      collection: database.collection<MCPAuthorityConsistencyFence>('consistency'),
      now: () => new Date('2026-08-07T12:00:00.000Z'),
      createOwnerId: () => 'owner-1',
      mutationWaitTimeoutMs: 2,
      mutationRetryDelayMs: 1,
      wait,
    });
    await consistency.initializeMCPAuthorityConsistency();

    await expect(
      consistency.mutateMCPAuthority(async () => {
        throw new Error('write failed');
      }),
    ).rejects.toThrow('write failed');
    await expect(consistency.assertGeneration(0)).rejects.toEqual(
      expect.objectContaining({ reason: 'dirty' }),
    );
    await expect(consistency.initializeMCPAuthorityConsistency()).rejects.toEqual(
      expect.objectContaining({ reason: 'dirty' }),
    );
    const blockedAction = jest.fn(async () => 'must not run');
    await expect(consistency.mutateMCPAuthority(blockedAction)).rejects.toEqual(
      expect.objectContaining({ reason: 'dirty' }),
    );
    expect(blockedAction).not.toHaveBeenCalled();
    expect(wait).toHaveBeenCalledTimes(2);
  });

  test('blocks reads and serializes competing writers while a mutation is active', async () => {
    const database = client.db('authority');
    const consistency = createMCPAuthorityConsistencyModule({
      collection: database.collection<MCPAuthorityConsistencyFence>('consistency'),
      now: () => new Date('2026-08-07T12:00:00.000Z'),
      createOwnerId: () => 'owner-1',
    });
    const entered = createDeferred();
    const release = createDeferred();
    let competingEntered = false;
    await consistency.initializeMCPAuthorityConsistency();

    const mutation = consistency.mutateMCPAuthority(async () => {
      entered.resolve();
      await release.promise;
      return 'written';
    });
    await entered.promise;

    await expect(consistency.readStableSnapshot(async () => 'stale')).rejects.toEqual(
      expect.objectContaining({ reason: 'dirty' }),
    );
    const competing = consistency.mutateMCPAuthority(async () => {
      competingEntered = true;
      return 'competing';
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(competingEntered).toBe(false);

    release.resolve();
    await expect(mutation).resolves.toEqual({ generation: 1, result: 'written' });
    await expect(competing).resolves.toEqual({ generation: 2, result: 'competing' });
  });

  test('coalesces nested authority mutations into one published generation', async () => {
    const database = client.db('authority');
    let ownerCount = 0;
    const consistency = createMCPAuthorityConsistencyModule({
      collection: database.collection<MCPAuthorityConsistencyFence>('consistency'),
      now: () => new Date('2026-08-07T12:00:00.000Z'),
      createOwnerId: () => `owner-${++ownerCount}`,
    });
    const values = database.collection<{ _id: string; value: string }>('values');
    await values.insertOne({ _id: 'selected', value: 'before' });
    await consistency.initializeMCPAuthorityConsistency();

    await expect(
      consistency.mutateMCPAuthority(async () => {
        return await consistency.mutateMCPAuthority(async () => {
          await values.updateOne({ _id: 'selected' }, { $set: { value: 'after' } });
          return 'nested';
        });
      }),
    ).resolves.toEqual({
      generation: 1,
      result: { generation: 1, result: 'nested' },
    });
    expect(ownerCount).toBe(1);
  });

  test('keeps the fence dirty when an outer mutation catches a nested write failure', async () => {
    const consistency = createMCPAuthorityConsistencyModule({
      collection: client.db('authority').collection<MCPAuthorityConsistencyFence>('consistency'),
      now: () => new Date('2026-08-07T12:00:00.000Z'),
      createOwnerId: () => 'owner-1',
    });
    await consistency.initializeMCPAuthorityConsistency();

    await expect(
      consistency.mutateMCPAuthority(async () => {
        try {
          await consistency.mutateMCPAuthority(async () => {
            throw new Error('nested write failed');
          });
        } catch {
          return 'caught';
        }
        return 'unreachable';
      }),
    ).rejects.toThrow('nested write failed');
    await expect(consistency.assertGeneration(0)).rejects.toEqual(
      expect.objectContaining({ reason: 'dirty' }),
    );
  });

  test('rejects an exhausted generation before running an authority mutation', async () => {
    const database = client.db('authority');
    const fences = database.collection<MCPAuthorityConsistencyFence>('consistency');
    const consistency = createMCPAuthorityConsistencyModule({
      collection: fences,
      now: () => new Date('2026-08-07T12:00:00.000Z'),
      createOwnerId: () => 'owner-1',
    });
    const action = jest.fn(async () => 'must not run');
    await fences.insertOne({
      _id: 'global',
      generation: Number.MAX_SAFE_INTEGER,
      dirty: false,
      updatedAt: new Date('2026-08-07T12:00:00.000Z'),
    });

    await expect(consistency.mutateMCPAuthority(action)).rejects.toEqual(
      expect.objectContaining({ reason: 'generation_exhausted' }),
    );
    expect(action).not.toHaveBeenCalled();
  });

  test('rejects a clean fence that retains mutation ownership metadata', async () => {
    const database = client.db('authority');
    const fences = database.collection<MCPAuthorityConsistencyFence>('consistency');
    const consistency = createMCPAuthorityConsistencyModule({
      collection: fences,
      now: () => new Date('2026-08-07T12:00:00.000Z'),
      createOwnerId: () => 'owner-1',
    });
    await fences.insertOne({
      _id: 'global',
      generation: 4,
      dirty: false,
      ownerId: 'stale-owner',
      dirtyAt: new Date('2026-08-07T11:00:00.000Z'),
      updatedAt: new Date('2026-08-07T12:00:00.000Z'),
    });

    await expect(consistency.initializeMCPAuthorityConsistency()).rejects.toEqual(
      expect.objectContaining({ reason: 'malformed_fence' }),
    );
  });
});
