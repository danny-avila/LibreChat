import mongoose from 'mongoose';
import { MongoMemoryReplSet, MongoMemoryServer } from 'mongodb-memory-server';
import type { Connection } from 'mongoose';
import {
  getMCPAuthoritySnapshotTransactionCapability,
  assertMCPAuthoritySnapshotTransactionCapability,
} from './mcpAuthorityTransactionCapability';
import { MCP_AUTHORITY_SNAPSHOT_TRANSACTION_OPTIONS } from './mcpAuthorityTransaction';

jest.setTimeout(60_000);

async function seedBaseRoles(connection: Connection): Promise<void> {
  await connection.db!.collection('roles').insertOne({ name: 'USER' });
}

describe('MCP authority snapshot-transaction capability', () => {
  test('rejects a standalone MongoDB deployment', async () => {
    const mongoServer = await MongoMemoryServer.create();
    const connection = await mongoose.createConnection(mongoServer.getUri()).asPromise();

    try {
      await seedBaseRoles(connection);
      await expect(getMCPAuthoritySnapshotTransactionCapability(connection)).resolves.toMatchObject(
        {
          capable: false,
          reason: 'snapshot_transactions_unavailable',
          retryable: false,
        },
      );
      await expect(
        assertMCPAuthoritySnapshotTransactionCapability(connection),
      ).rejects.toMatchObject({
        name: 'MCPAuthoritySnapshotTransactionCapabilityError',
        code: 'MCP_AUTHORITY_SNAPSHOT_TRANSACTION_CAPABILITY_UNAVAILABLE',
        reason: 'snapshot_transactions_unavailable',
      });
    } finally {
      await connection.close();
      await mongoServer.stop();
    }
  });

  test('accepts primary snapshot-transaction capability and commits the probe', async () => {
    const replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    const connection = await mongoose.createConnection(replicaSet.getUri()).asPromise();
    const startSession = connection.startSession.bind(connection);
    let startTransaction: jest.SpyInstance | undefined;
    let commitTransaction: jest.SpyInstance | undefined;

    try {
      await seedBaseRoles(connection);
      jest.spyOn(connection, 'startSession').mockImplementation(async (options) => {
        const session = await startSession(options);
        startTransaction = jest.spyOn(session, 'startTransaction');
        commitTransaction = jest.spyOn(session, 'commitTransaction');
        return session;
      });
      await expect(getMCPAuthoritySnapshotTransactionCapability(connection)).resolves.toEqual({
        capable: true,
        capability: 'primary_snapshot_transactions',
      });
      expect(startTransaction?.mock.calls[0]?.[0]).toBe(MCP_AUTHORITY_SNAPSHOT_TRANSACTION_OPTIONS);
      expect(commitTransaction).toHaveBeenCalledTimes(1);
    } finally {
      await connection.close();
      await replicaSet.stop();
    }
  });

  test('reports missing base role seeding separately from database capability', async () => {
    const replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    const connection = await mongoose.createConnection(replicaSet.getUri()).asPromise();

    try {
      await expect(getMCPAuthoritySnapshotTransactionCapability(connection)).resolves.toMatchObject(
        {
          capable: false,
          reason: 'prerequisite_missing',
          retryable: true,
        },
      );
    } finally {
      await connection.close();
      await replicaSet.stop();
    }
  });

  test('normalizes a database session capability failure', async () => {
    const replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    const connection = await mongoose.createConnection(replicaSet.getUri()).asPromise();

    try {
      await seedBaseRoles(connection);
      jest
        .spyOn(connection, 'startSession')
        .mockRejectedValueOnce(new Error('sessions unavailable'));

      await expect(
        assertMCPAuthoritySnapshotTransactionCapability(connection),
      ).rejects.toMatchObject({
        name: 'MCPAuthoritySnapshotTransactionCapabilityError',
        code: 'MCP_AUTHORITY_SNAPSHOT_TRANSACTION_CAPABILITY_UNAVAILABLE',
        reason: 'snapshot_transactions_unavailable',
        retryable: false,
      });
    } finally {
      await connection.close();
      await replicaSet.stop();
    }
  });

  test('does not let session cleanup mask the normalized capability failure', async () => {
    const replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    const connection = await mongoose.createConnection(replicaSet.getUri()).asPromise();
    const startSession = connection.startSession.bind(connection);

    try {
      await seedBaseRoles(connection);
      jest.spyOn(connection, 'startSession').mockImplementation(async (options) => {
        const session = await startSession(options);
        jest.spyOn(session, 'startTransaction').mockImplementationOnce(() => {
          throw new Error('snapshot transactions unavailable');
        });
        jest
          .spyOn(session, 'endSession')
          .mockRejectedValueOnce(new Error('session cleanup failed'));
        return session;
      });

      await expect(
        assertMCPAuthoritySnapshotTransactionCapability(connection),
      ).rejects.toMatchObject({
        name: 'MCPAuthoritySnapshotTransactionCapabilityError',
        code: 'MCP_AUTHORITY_SNAPSHOT_TRANSACTION_CAPABILITY_UNAVAILABLE',
        reason: 'snapshot_transactions_unavailable',
        retryable: false,
        message: expect.stringContaining('snapshot transactions unavailable'),
      });
    } finally {
      await connection.close();
      await replicaSet.stop();
    }
  });

  test('exposes an election failure as retryable for bounded caller reprobes', async () => {
    const replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    const connection = await mongoose.createConnection(replicaSet.getUri()).asPromise();

    try {
      await seedBaseRoles(connection);
      jest.spyOn(connection, 'startSession').mockRejectedValueOnce(
        Object.assign(new Error('primary stepped down'), {
          code: 189,
          errorLabels: ['TransientTransactionError'],
        }),
      );

      await expect(getMCPAuthoritySnapshotTransactionCapability(connection)).resolves.toMatchObject(
        {
          capable: false,
          reason: 'snapshot_transactions_unavailable',
          retryable: true,
        },
      );
    } finally {
      await connection.close();
      await replicaSet.stop();
    }
  });

  test('exposes an unlabeled DocumentDB NoSuchTransaction failure as retryable', async () => {
    const replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    const connection = await mongoose.createConnection(replicaSet.getUri()).asPromise();

    try {
      await seedBaseRoles(connection);
      jest
        .spyOn(connection, 'startSession')
        .mockRejectedValueOnce(Object.assign(new Error('transaction was evicted'), { code: 251 }));

      await expect(getMCPAuthoritySnapshotTransactionCapability(connection)).resolves.toMatchObject(
        {
          capable: false,
          reason: 'snapshot_transactions_unavailable',
          retryable: true,
        },
      );
    } finally {
      await connection.close();
      await replicaSet.stop();
    }
  });
});
