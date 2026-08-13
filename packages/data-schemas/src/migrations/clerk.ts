import type { Connection } from 'mongoose';
import { retryWithBackoff } from '~/utils/retry';
import logger from '~/config/winston';

export class ClerkIndexAssuranceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ClerkIndexAssuranceError';
  }
}

interface ClerkIndexSpec {
  collection: string;
  key: Record<string, 1>;
  options: {
    name: string;
    unique?: boolean;
    partialFilterExpression?: Record<string, unknown>;
    expireAfterSeconds?: number;
  };
}

/**
 * The exact indexes Fixed Contract 5 requires. Shared between
 * `ensureClerkIndexes` (production, `MONGO_AUTO_INDEX=false`) and its test
 * suite so the assured definitions and the asserted-on definitions never
 * silently drift apart.
 */
export const CLERK_INDEX_SPECS: readonly ClerkIndexSpec[] = [
  {
    collection: 'users',
    key: { clerkId: 1, tenantId: 1 },
    options: {
      name: 'clerkId_1_tenantId_1',
      unique: true,
      partialFilterExpression: { clerkId: { $exists: true } },
    },
  },
  {
    collection: 'sessions',
    key: { clerkTokenId: 1, tenantId: 1 },
    options: {
      name: 'clerkTokenId_1_tenantId_1',
      unique: true,
      partialFilterExpression: { clerkTokenId: { $exists: true } },
    },
  },
  {
    collection: 'sessions',
    key: { clerkSessionId: 1, tenantId: 1 },
    options: {
      name: 'clerkSessionId_1_tenantId_1',
      partialFilterExpression: { clerkSessionId: { $exists: true } },
    },
  },
  {
    collection: 'sessions',
    key: { clerkUserId: 1, tenantId: 1 },
    options: {
      name: 'clerkUserId_1_tenantId_1',
      partialFilterExpression: { clerkUserId: { $exists: true } },
    },
  },
  {
    collection: 'clerkauthclaims',
    key: { tenantScope: 1, clerkTokenId: 1 },
    options: {
      name: 'tenantScope_1_clerkTokenId_1',
      unique: true,
      partialFilterExpression: { kind: 'consumed_token' },
    },
  },
  {
    collection: 'clerkauthclaims',
    key: { clerkSessionId: 1 },
    options: {
      name: 'clerkSessionId_1',
      unique: true,
      partialFilterExpression: { kind: 'session_state' },
    },
  },
  {
    collection: 'clerkauthclaims',
    key: { clerkUserId: 1 },
    options: {
      name: 'clerkUserId_1',
      unique: true,
      partialFilterExpression: { kind: 'user_state' },
    },
  },
  {
    collection: 'clerkauthclaims',
    key: { expiration: 1 },
    options: { name: 'expiration_1', expireAfterSeconds: 0 },
  },
] as const;

/** Fields whose presence must never be null/empty/whitespace (preflight step 1). */
const NO_BLANK_CHECKS: ReadonlyArray<{ collection: string; field: string }> = [
  { collection: 'users', field: 'clerkId' },
  { collection: 'sessions', field: 'clerkTokenId' },
  { collection: 'sessions', field: 'clerkSessionId' },
  { collection: 'sessions', field: 'clerkUserId' },
  { collection: 'clerkauthclaims', field: 'tenantScope' },
  { collection: 'clerkauthclaims', field: 'clerkTokenId' },
  { collection: 'clerkauthclaims', field: 'clerkSessionId' },
  { collection: 'clerkauthclaims', field: 'clerkUserId' },
];

type MongoDb = NonNullable<Connection['db']>;

function sameKeyShape(a: Record<string, number>, b: Record<string, number>): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) {
    return false;
  }
  return aKeys.every((key, i) => key === bKeys[i] && a[key] === b[bKeys[i]]);
}

interface ExistingIndexInfo {
  name?: string;
  key: Record<string, number>;
  unique?: boolean;
  partialFilterExpression?: Record<string, unknown>;
  expireAfterSeconds?: number;
}

function isCompatible(existing: ExistingIndexInfo, spec: ClerkIndexSpec): boolean {
  if (!sameKeyShape(existing.key, spec.key)) {
    return false;
  }
  if (Boolean(existing.unique) !== Boolean(spec.options.unique)) {
    return false;
  }
  const existingPartial = JSON.stringify(existing.partialFilterExpression ?? null);
  const specPartial = JSON.stringify(spec.options.partialFilterExpression ?? null);
  if (existingPartial !== specPartial) {
    return false;
  }
  const existingTtl = existing.expireAfterSeconds ?? null;
  const specTtl = spec.options.expireAfterSeconds ?? null;
  return existingTtl === specTtl;
}

/** Preflight 1: reject any present-but-blank Clerk field before indexing on it. */
async function preflightNoBlankValues(db: MongoDb): Promise<void> {
  for (const { collection, field } of NO_BLANK_CHECKS) {
    const count = await db
      .collection(collection)
      .countDocuments({
        $or: [
          { [field]: null },
          { [field]: '' },
          { [field]: { $type: 'string', $regex: /^\s+$/ } },
        ],
      })
      .catch(() => 0);
    if (count > 0) {
      throw new ClerkIndexAssuranceError(
        `[ensureClerkIndexes] Preflight failed: ${collection}.${field} has ${count} null/empty/whitespace value(s)`,
      );
    }
  }
}

/** Preflight 2: reject duplicate values within each unique index's exact key scope. */
async function preflightNoDuplicates(db: MongoDb): Promise<void> {
  for (const spec of CLERK_INDEX_SPECS.filter((s) => s.options.unique)) {
    const groupId = Object.keys(spec.key).reduce<Record<string, string>>((acc, field) => {
      acc[field] = `$${field}`;
      return acc;
    }, {});
    const duplicates = await db
      .collection(spec.collection)
      .aggregate([
        { $match: spec.options.partialFilterExpression ?? {} },
        { $group: { _id: groupId, count: { $sum: 1 } } },
        { $match: { count: { $gt: 1 } } },
        { $limit: 1 },
        { $project: { _id: 0, count: 1 } },
      ])
      .toArray()
      .catch(() => []);
    if (duplicates.length > 0) {
      throw new ClerkIndexAssuranceError(
        `[ensureClerkIndexes] Preflight failed: ${spec.collection} has duplicate values for ` +
          `${JSON.stringify(spec.key)} (${duplicates[0].count} rows) — cannot create unique index "${spec.options.name}"`,
      );
    }
  }
}

async function findCompatibleOrConflicting(
  db: MongoDb,
  spec: ClerkIndexSpec,
): Promise<'exists' | 'missing'> {
  let existingIndexes: ExistingIndexInfo[];
  try {
    existingIndexes = (await db.collection(spec.collection).indexes()) as ExistingIndexInfo[];
  } catch {
    /** Collection doesn't exist yet — nothing to conflict with. */
    return 'missing';
  }

  const sameName = existingIndexes.find((idx) => idx.name === spec.options.name);
  if (sameName) {
    if (!isCompatible(sameName, spec)) {
      throw new ClerkIndexAssuranceError(
        `[ensureClerkIndexes] Existing index "${spec.options.name}" on "${spec.collection}" is incompatible with the required definition`,
      );
    }
    return 'exists';
  }

  const sameKey = existingIndexes.find((idx) => sameKeyShape(idx.key, spec.key));
  if (sameKey) {
    if (!isCompatible(sameKey, spec)) {
      throw new ClerkIndexAssuranceError(
        `[ensureClerkIndexes] Existing index "${sameKey.name}" on "${spec.collection}" has an ` +
          `incompatible definition for key ${JSON.stringify(spec.key)}`,
      );
    }
    return 'exists';
  }

  return 'missing';
}

async function checkTransactionSupport(connection: Connection): Promise<boolean> {
  const session = await connection.startSession();
  try {
    session.startTransaction();
    await connection.collection('__clerk_txn_probe__').findOne({}, { session });
    await session.commitTransaction();
    return true;
  } catch {
    try {
      await session.abortTransaction();
    } catch {
      /** best-effort abort */
    }
    return false;
  } finally {
    await session.endSession();
  }
}

/**
 * Assures every Fixed-Contract-5 index exists with the exact declared
 * key/options. Idempotent. Never calls `syncIndexes()` — production index
 * assurance is targeted and awaited so `MONGO_AUTO_INDEX=false` deployments
 * are not left with unenforced uniqueness. Fails closed (rejects) on a
 * preflight duplicate/blank value, an incompatible existing index, a
 * creation failure (e.g. an engine that rejects partial unique indexes), or
 * missing multi-document transaction support.
 */
export async function ensureClerkIndexes(connection: Connection): Promise<void> {
  const db = connection.db;
  if (!db) {
    throw new ClerkIndexAssuranceError('[ensureClerkIndexes] Connection has no database handle');
  }

  await preflightNoBlankValues(db);
  await preflightNoDuplicates(db);

  for (const spec of CLERK_INDEX_SPECS) {
    const status = await findCompatibleOrConflicting(db, spec);
    if (status === 'exists') {
      continue;
    }
    await retryWithBackoff(
      () => db.collection(spec.collection).createIndex(spec.key, spec.options),
      `ensureClerkIndexes(${spec.collection}.${spec.options.name})`,
    ).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      throw new ClerkIndexAssuranceError(
        `[ensureClerkIndexes] Failed to create index "${spec.options.name}" on "${spec.collection}": ${message}`,
      );
    });
  }

  for (const spec of CLERK_INDEX_SPECS) {
    const status = await findCompatibleOrConflicting(db, spec);
    if (status !== 'exists') {
      throw new ClerkIndexAssuranceError(
        `[ensureClerkIndexes] Index "${spec.options.name}" on "${spec.collection}" was not created`,
      );
    }
  }

  const transactionsSupported = await checkTransactionSupport(connection);
  if (!transactionsSupported) {
    throw new ClerkIndexAssuranceError(
      '[ensureClerkIndexes] Multi-document transaction support is required when Clerk is enabled but is not available on this deployment',
    );
  }

  logger.info('[ensureClerkIndexes] All Clerk indexes assured; transactions supported.');
}
