import type { Connection, ClientSession } from 'mongoose';
import { MCP_AUTHORITY_SNAPSHOT_TRANSACTION_OPTIONS } from './mcpAuthorityTransaction';

export type MCPAuthoritySnapshotTransactionCapabilityReason =
  | 'connection_unavailable'
  | 'prerequisite_missing'
  | 'snapshot_transactions_unavailable';

export type MCPAuthoritySnapshotTransactionCapability =
  | Readonly<{ capable: true; capability: 'primary_snapshot_transactions' }>
  | Readonly<{
      capable: false;
      reason: MCPAuthoritySnapshotTransactionCapabilityReason;
      message: string;
      retryable: boolean;
    }>;

interface MongoErrorDetails extends Error {
  readonly code?: number;
  readonly errorLabels?: readonly string[];
  hasErrorLabel?(label: string): boolean;
}

const TRANSIENT_DATABASE_ERROR_CODES = new Set([
  6, 7, 89, 91, 189, 251, 9001, 10107, 11600, 11602, 13435, 13436,
]);
const TRANSIENT_DATABASE_ERROR_LABELS = [
  'TransientTransactionError',
  'RetryableWriteError',
  'UnknownTransactionCommitResult',
] as const;
const TRANSIENT_DATABASE_ERROR_NAMES = new Set([
  'MongoNetworkError',
  'MongoNetworkTimeoutError',
  'MongoServerSelectionError',
  'MongoTopologyClosedError',
]);

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function isTransientDatabaseError(error: Error): boolean {
  const details = error as MongoErrorDetails;
  if (details.code != null && TRANSIENT_DATABASE_ERROR_CODES.has(details.code)) {
    return true;
  }
  if (TRANSIENT_DATABASE_ERROR_NAMES.has(details.name)) {
    return true;
  }
  return TRANSIENT_DATABASE_ERROR_LABELS.some(
    (label) =>
      details.hasErrorLabel?.(label) === true || details.errorLabels?.includes(label) === true,
  );
}

export class MCPAuthoritySnapshotTransactionCapabilityError extends Error {
  public readonly code = 'MCP_AUTHORITY_SNAPSHOT_TRANSACTION_CAPABILITY_UNAVAILABLE' as const;

  constructor(
    public readonly reason: MCPAuthoritySnapshotTransactionCapabilityReason,
    databaseError: Error,
    public readonly retryable: boolean,
  ) {
    super(
      'MCP authority requires primary snapshot-transaction capability: ' + databaseError.message,
    );
    this.name = 'MCPAuthoritySnapshotTransactionCapabilityError';
  }
}

export async function assertMCPAuthoritySnapshotTransactionCapability(
  connection: Connection,
): Promise<void> {
  if (!connection.db || connection.readyState !== 1) {
    throw new MCPAuthoritySnapshotTransactionCapabilityError(
      'connection_unavailable',
      new Error('database connection is not ready'),
      true,
    );
  }

  let rolesExist: boolean;
  try {
    rolesExist = await connection.db
      .listCollections({ name: 'roles' }, { nameOnly: true })
      .hasNext();
  } catch (error) {
    const databaseError = asError(error);
    throw new MCPAuthoritySnapshotTransactionCapabilityError(
      'prerequisite_missing',
      databaseError,
      isTransientDatabaseError(databaseError),
    );
  }
  if (!rolesExist) {
    throw new MCPAuthoritySnapshotTransactionCapabilityError(
      'prerequisite_missing',
      new Error('base role seeding has not completed'),
      true,
    );
  }

  let session: ClientSession | undefined;
  let databaseError: Error | undefined;
  try {
    session = await connection.startSession();
    session.startTransaction(MCP_AUTHORITY_SNAPSHOT_TRANSACTION_OPTIONS);
    await connection.db.collection('roles').findOne({}, { session, projection: { _id: 1 } });
    await session.commitTransaction();
  } catch (error) {
    if (session?.inTransaction()) {
      try {
        await session.abortTransaction();
      } catch {
        /** The capability probe already failed closed. */
      }
    }
    databaseError = asError(error);
  }
  try {
    await session?.endSession();
  } catch (error) {
    databaseError ??= asError(error);
  }
  if (databaseError) {
    throw new MCPAuthoritySnapshotTransactionCapabilityError(
      'snapshot_transactions_unavailable',
      databaseError,
      isTransientDatabaseError(databaseError),
    );
  }
}

export async function getMCPAuthoritySnapshotTransactionCapability(
  connection: Connection,
): Promise<MCPAuthoritySnapshotTransactionCapability> {
  try {
    await assertMCPAuthoritySnapshotTransactionCapability(connection);
    return { capable: true, capability: 'primary_snapshot_transactions' };
  } catch (error) {
    if (error instanceof MCPAuthoritySnapshotTransactionCapabilityError) {
      return {
        capable: false,
        reason: error.reason,
        message: error.message,
        retryable: error.retryable,
      };
    }
    const databaseError = asError(error);
    return {
      capable: false,
      reason: 'snapshot_transactions_unavailable',
      message: databaseError.message,
      retryable: isTransientDatabaseError(databaseError),
    };
  }
}
