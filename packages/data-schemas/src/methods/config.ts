import { Types } from 'mongoose';
import { randomUUID } from 'crypto';
import {
  BASE_PRINCIPAL_CONFIG_SECTIONS,
  PrincipalType,
  PrincipalModel,
} from 'librechat-data-provider';
import type { FilterQuery, Model, ClientSession } from 'mongoose';
import type { TCustomConfig } from 'librechat-data-provider';
import type { IConfig } from '~/types';
import {
  sanitizeAdminConfigOverrides,
  sanitizeAdminConfigTombstones,
} from '~/admin/configOverrides';
import { getTenantId, SYSTEM_TENANT_ID } from '~/config/tenantContext';
import { indexedArrayPathError } from '~/admin/indexedArrayPath';
import { BASE_CONFIG_PRINCIPAL_ID } from '~/admin/capabilities';
import { escapeRegExp } from '~/utils/string';

export const ADMIN_CONFIG_REVISIONS_COLLECTION = 'admin_config_revisions';
/** High-water CAS versions that survive document deletion (prevents ABA reuse). */
export const ADMIN_CONFIG_VERSION_EPOCHS_COLLECTION = 'admin_config_version_epochs';
export const MAX_CONFIG_REVISIONS = 50;
const MAX_CONFIG_CAS_RETRIES = 5;
const DEFAULT_CONFIG_PRIORITY = 10;
const BASE_PRINCIPAL_OVERRIDE_SECTIONS = new Set<string>(BASE_PRINCIPAL_CONFIG_SECTIONS);

const configIndexPromises = new WeakMap<Model<IConfig>, Promise<unknown>>();

const TENANT_ALIAS_FILTER = { $or: [{ tenantId: { $exists: false } }, { tenantId: '' }] };

function epochTenantKey(tenantId?: string | null): string | null {
  if (tenantId == null || tenantId === '' || tenantId === SYSTEM_TENANT_ID) {
    return null;
  }
  return tenantId;
}

function isBaseConfigPrincipal(principalType: PrincipalType, principalId: string): boolean {
  return principalType === PrincipalType.ROLE && principalId === BASE_CONFIG_PRINCIPAL_ID;
}

function baseConfigEpochFilter(tenantId?: string | null): {
  principalType: PrincipalType;
  principalId: string;
  tenantId: string | null;
} {
  return {
    principalType: PrincipalType.ROLE,
    principalId: BASE_CONFIG_PRINCIPAL_ID,
    tenantId: epochTenantKey(tenantId ?? getTenantId()),
  };
}

function epochCollection(Config: Model<IConfig>) {
  return Config.db.collection(ADMIN_CONFIG_VERSION_EPOCHS_COLLECTION);
}

function readAllocatedEpochVersion(result: unknown): number {
  if (result == null || typeof result !== 'object') {
    return 1;
  }
  const direct = result as { version?: number; value?: { version?: number } | null };
  if (typeof direct.version === 'number') {
    return direct.version;
  }
  if (direct.value != null && typeof direct.value.version === 'number') {
    return direct.value.version;
  }
  return 1;
}

/**
 * Raises the durable CAS high-water mark for the base config. Uses `Config.db`
 * so connection-local models (not only the default mongoose connection) work.
 */
async function raiseBaseConfigVersionEpoch(
  Config: Model<IConfig>,
  version: number,
  session?: ClientSession,
  tenantId?: string | null,
): Promise<void> {
  await epochCollection(Config).updateOne(
    baseConfigEpochFilter(tenantId),
    { $max: { version } },
    { upsert: true, ...(session ? { session } : {}) },
  );
}

/**
 * Atomically allocates the next base-config CAS version from the epoch.
 * Prefer calling inside the same session/transaction as the Config create that
 * persists the returned value; session may be omitted on standalone MongoDB.
 */
async function allocateBaseConfigVersion(
  Config: Model<IConfig>,
  session?: ClientSession,
  tenantId?: string | null,
): Promise<number> {
  const result = await epochCollection(Config).findOneAndUpdate(
    baseConfigEpochFilter(tenantId),
    { $inc: { version: 1 } },
    { upsert: true, returnDocument: 'after', ...(session ? { session } : {}) },
  );
  return readAllocatedEpochVersion(result);
}

function isTransactionUnsupported(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return (
    message.includes('Transaction numbers are only allowed') ||
    message.includes('transaction numbers are only allowed')
  );
}

/**
 * Runs `fn` in a transaction on `Config.db` when possible. Falls back to
 * session-less execution on standalone MongoDB (e.g. unit-test memory servers)
 * while still allocating/raising the epoch around the Config write.
 */
async function withOwnedSession<T>(
  Config: Model<IConfig>,
  session: ClientSession | undefined,
  fn: (session: ClientSession | undefined) => Promise<T>,
): Promise<T> {
  if (session) {
    return fn(session);
  }
  const owned = await Config.db.startSession();
  try {
    let outcome!: T;
    try {
      await owned.withTransaction(async () => {
        outcome = await fn(owned);
      });
      return outcome;
    } catch (err) {
      if (!isTransactionUnsupported(err)) {
        throw err;
      }
    }
  } finally {
    await owned.endSession();
  }
  return fn(undefined);
}

/**
 * Removes duplicate Config docs for the same principal+tenant before the unique
 * index is built. Uses a fast path when the unique index already exists and all
 * legacy empty-string aliases have been canonicalized, so repeated pod startups
 * after migration complete do not scan the whole collection.
 *
 * Uses raw collection operations to bypass tenant-isolation middleware.
 * Groups by $ifNull so null, missing, and '' are all treated as the same logical
 * tenant. Deletes only explicit loser IDs to avoid racing with concurrent inserts.
 *
 * Canonical value for "no tenant" is null. MongoDB indexes null and absent fields
 * identically, so old-pod writes (missing tenantId) and new-pod writes (null)
 * collide correctly in the unique index during rolling deployments.
 */
async function deduplicateConfigPrincipals(Config: Model<IConfig>): Promise<void> {
  let indexes: Array<{
    unique?: boolean;
    key?: Record<string, unknown>;
    partialFilterExpression?: unknown;
    sparse?: boolean;
  }> = [];
  try {
    // eslint-disable-next-line no-restricted-syntax -- cross-tenant migration; must bypass tenant middleware
    indexes = await Config.collection.listIndexes().toArray();
  } catch (err) {
    if ((err as { code?: number }).code === 26) {
      return;
    }
    throw err;
  }

  const REQUIRED_KEYS = new Set(['principalType', 'principalId', 'tenantId']);
  const hasUnique = indexes.some((idx) => {
    if (!idx.unique || !idx.key) return false;
    const keys = Object.keys(idx.key);
    if (keys.length !== REQUIRED_KEYS.size) return false;
    if (keys.some((k) => !REQUIRED_KEYS.has(k))) return false;
    if (idx.partialFilterExpression != null || idx.sparse === true) return false;
    return true;
  });

  if (hasUnique) {
    // Migration has already run. A cheap indexed probe (single-field tenantId index)
    // checks for any surviving legacy empty-string aliases. If none remain, skip the
    // collection-wide aggregation — it would scan every null/missing entry anyway
    // because MongoDB's non-sparse index cannot distinguish them.
    // eslint-disable-next-line no-restricted-syntax -- cross-tenant migration; must bypass tenant middleware
    const legacyCount = await Config.collection.countDocuments({ tenantId: '' }, { limit: 1 });
    if (legacyCount === 0) {
      return;
    }
  }

  // Full dedup: index not yet built, or legacy '' aliases still present.
  // Dedup before canonicalization so the updateMany below cannot produce E11000
  // when the existing index already contains both '' and null for the same principal.
  // eslint-disable-next-line no-restricted-syntax -- cross-tenant migration; must bypass tenant middleware
  const loserDocs = await Config.collection
    .aggregate<{ loserId: Types.ObjectId }>([
      { $sort: { configVersion: -1, createdAt: -1 } },
      {
        $group: {
          _id: {
            principalType: '$principalType',
            principalId: '$principalId',
            tenantId: { $ifNull: ['$tenantId', ''] },
          },
          keepId: { $first: '$_id' },
          allIds: { $push: '$_id' },
        },
      },
      { $unwind: '$allIds' },
      { $match: { $expr: { $ne: ['$allIds', '$keepId'] } } },
      { $project: { loserId: '$allIds' } },
    ])
    .toArray();

  const loserIds = loserDocs.map((d) => d.loserId);
  if (loserIds.length > 0) {
    // eslint-disable-next-line no-restricted-syntax -- cross-tenant migration; must bypass tenant middleware
    await Config.collection.deleteMany({ _id: { $in: loserIds } });
  }

  // Canonicalize both missing and empty-string tenantId to null after dedup.
  // After deletion there is at most one doc per logical principal, so this update
  // cannot collide even when the unique index already exists.
  // eslint-disable-next-line no-restricted-syntax -- cross-tenant migration; must bypass tenant middleware
  await Config.collection.updateMany(TENANT_ALIAS_FILTER, { $set: { tenantId: null } });
}

/**
 * The concurrent-create retry in patch/tombstone flows depends on duplicate-key
 * error 11000 from `{ principalType, principalId, tenantId }` unique index.
 * With `MONGO_AUTO_INDEX=false` or blank `MONGO_AUTO_INDEX`, a fresh deployment
 * may never build that index and both creates can succeed. Build it once before
 * the first write so duplicate prevention never depends on a background build.
 *
 * A dedup migration runs first when the unique index is absent so that existing
 * deployments with logical duplicates do not fail startup with a build error.
 */
export function ensureConfigIndexes(mongoose: typeof import('mongoose')): Promise<unknown> {
  const Config = mongoose.models.Config as Model<IConfig> | undefined;
  if (!Config) {
    return Promise.resolve();
  }
  const existing = configIndexPromises.get(Config);
  if (existing) {
    return existing;
  }
  const MAX_INDEX_BUILD_RETRIES = 3;
  const promise = (async () => {
    let lastErr: unknown;
    for (let attempt = 0; attempt < MAX_INDEX_BUILD_RETRIES; attempt += 1) {
      try {
        await deduplicateConfigPrincipals(Config);
        await Promise.all([
          Config.createIndexes(),
          ensureRevisionCollectionIndexes(Config),
          ensureVersionEpochIndexes(Config),
        ]);
        // Best-effort startup warmup: raise epoch to match all existing base
        // config versions so pre-epoch writes cannot be reused as CAS targets.
        // This is NOT a rolling-upgrade fence — an old pod that writes and
        // deletes after this scan can still leave the epoch behind. Deployments
        // with concurrent pre-epoch writers must drain old pods before new ones
        // begin serving requests.
        // Use Config.collection (raw) to bypass tenant-isolation middleware so
        // this scan works under TENANT_ISOLATION_STRICT=true at startup.
        // eslint-disable-next-line no-restricted-syntax -- intentional cross-tenant startup migration
        const baseDocs = await Config.collection
          .find(
            { principalType: PrincipalType.ROLE, principalId: BASE_CONFIG_PRINCIPAL_ID },
            { projection: { configVersion: 1, tenantId: 1 } },
          )
          .toArray();
        await Promise.all(
          baseDocs.map(async (doc) => {
            const version = interpretedConfigVersion(doc as { configVersion?: number | null });
            if (version != null) {
              await raiseBaseConfigVersionEpoch(
                Config,
                version,
                undefined,
                (doc.tenantId as string | null | undefined) ?? null,
              );
            }
          }),
        );
        return;
      } catch (err) {
        if ((err as { code?: number }).code === 11000 && attempt < MAX_INDEX_BUILD_RETRIES - 1) {
          lastErr = err;
          continue;
        }
        throw err;
      }
    }
    throw lastErr;
  })().catch((err) => {
    configIndexPromises.delete(Config);
    throw err;
  });
  configIndexPromises.set(Config, promise);
  return promise;
}

async function ensureRevisionCollectionIndexes(Config: Model<IConfig>): Promise<void> {
  const revisions = Config.db.collection(ADMIN_CONFIG_REVISIONS_COLLECTION);
  await Promise.all([
    revisions.createIndex(
      { id: 1 },
      { name: 'revision_id_lookup', unique: true, background: true },
    ),
    revisions.createIndex(
      { tenantId: 1, principalType: 1, principalId: 1, status: 1, createdAt: -1 },
      { name: 'scope_status_created', background: true },
    ),
  ]);
}

async function ensureVersionEpochIndexes(Config: Model<IConfig>): Promise<void> {
  const epochs = Config.db.collection(ADMIN_CONFIG_VERSION_EPOCHS_COLLECTION);
  await epochs.createIndex(
    { tenantId: 1, principalType: 1, principalId: 1 },
    { name: 'epoch_scope_unique', unique: true, background: true },
  );
}

export type ConfigRevisionCause = 'save' | 'import' | 'reset' | 'restore';

export type ConfigMutationResult =
  | { changed: true; config: IConfig | null; revision: ConfigRevisionSnapshot }
  | { changed: false; config: null; revision: null };

export class ConfigVersionConflictError extends Error {
  readonly currentVersion: number | null;
  constructor(currentVersion: number | null) {
    super('Config version conflict');
    this.name = 'ConfigVersionConflictError';
    this.currentVersion = currentVersion;
  }
}

export class ConfigRevisionNotFoundError extends Error {
  constructor(revisionId: string) {
    super('Revision not found');
    this.name = 'ConfigRevisionNotFoundError';
    this.revisionId = revisionId;
  }
  readonly revisionId: string;
}

export class TransactionRequiredError extends Error {
  constructor() {
    super(
      'Base config saves require a MongoDB replica set. ' +
        'Set mongodb.architecture to "replicaset" in your Helm values.',
    );
    this.name = 'TransactionRequiredError';
  }
}

export interface ConfigRevisionActor {
  actorId: string;
  actorEmail?: string;
  tenantId: string;
}

export type ConfigMutationOp =
  | { kind: 'fields'; resetPaths: string[]; fields: Record<string, unknown>; priority: number }
  | { kind: 'replace'; overrides: Record<string, unknown>; priority: number }
  | { kind: 'delete' }
  | { kind: 'restore'; revisionId: string };

export interface ConfigRevisionSnapshot {
  id: string;
  createdAt: string;
  cause: ConfigRevisionCause;
  actorId: string;
  actorEmail?: string;
  tenantId: string;
  principalType: PrincipalType;
  principalId: string;
  overrides: Record<string, unknown>;
  tombstones: string[];
  priority: number | null;
  isActive: boolean | null;
  absent: boolean;
  configVersion: number | null;
  status: 'final';
  committed: true;
}

export const MAX_FIELD_PATH_LENGTH = 512;
export const MAX_FIELD_PATH_SEGMENTS = 32;

const UNSAFE_FIELD_PATH_SEGMENTS = /(?:^|\.)(\$[^.]*|__[^.]*|constructor|prototype)(?:\.|$)/;

export function fieldPathLimitError(path: string): string | null {
  if (path.length > MAX_FIELD_PATH_LENGTH) {
    return `field path exceeds maximum length of ${MAX_FIELD_PATH_LENGTH}`;
  }
  let segmentCount = 1;
  for (let i = 0; i < path.length; i += 1) {
    if (path[i] === '.') {
      segmentCount += 1;
      if (segmentCount > MAX_FIELD_PATH_SEGMENTS) {
        return `field path exceeds maximum depth of ${MAX_FIELD_PATH_SEGMENTS} segments`;
      }
    }
  }
  return null;
}

export function fieldPathPolicyError(path: unknown): string | null {
  if (typeof path !== 'string') {
    return 'field path must be a string';
  }
  const limitError = fieldPathLimitError(path);
  if (limitError) {
    return limitError;
  }
  if (path.length === 0) {
    return 'field path must not be empty';
  }
  if (path.startsWith('.') || path.endsWith('.') || path.includes('..')) {
    return 'field path has invalid structure';
  }
  if (UNSAFE_FIELD_PATH_SEGMENTS.test(path)) {
    return 'field path contains forbidden segment';
  }
  return null;
}

export function isValidFieldPath(path: unknown): path is string {
  return fieldPathPolicyError(path) === null;
}

export type FindConfigByPrincipalOptions = {
  includeInactive?: boolean;
  /**
   * When set, applies an explicit tenant predicate (empty string matches legacy untagged docs).
   * When omitted, tenant isolation on the Config model applies tenant from async context.
   */
  tenantId?: string;
};

function assertValidFieldPath(fieldPath: string): void {
  const policyError = fieldPathPolicyError(fieldPath);
  if (policyError) {
    throw new Error(policyError);
  }
  const indexedError = indexedArrayPathError(fieldPath);
  if (indexedError) {
    throw new Error(indexedError);
  }
}

/** Deduplicate reset paths and drop descendants when an ancestor is already reset. */
export function canonicalizeResetPaths(paths: string[]): string[] {
  const unique = new Set<string>();
  for (const path of paths) {
    const policyError = fieldPathPolicyError(path);
    if (policyError) {
      throw new Error(policyError);
    }
    unique.add(path);
  }
  const kept: string[] = [];
  for (const path of unique) {
    let dominated = false;
    const parts = path.split('.');
    if (parts.length === 0) {
      continue;
    }
    let ancestor = parts[0];
    for (let i = 1; i < parts.length; i += 1) {
      if (unique.has(ancestor)) {
        dominated = true;
        break;
      }
      ancestor = `${ancestor}.${parts[i]}`;
    }
    if (!dominated) {
      kept.push(path);
    }
  }
  kept.sort((a, b) => a.localeCompare(b));
  return kept;
}

function cloneOverrides(source: unknown): Record<string, unknown> {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return {};
  }
  return structuredClone(source) as Record<string, unknown>;
}

function isBasePrincipalSectionPath(path: string): boolean {
  return BASE_PRINCIPAL_OVERRIDE_SECTIONS.has(path.split('.')[0]);
}

function preserveBasePrincipalOverrides(
  next: Record<string, unknown>,
  current: unknown,
): Record<string, unknown> {
  const preserved = cloneOverrides(next);
  const currentOverrides = cloneOverrides(current);
  for (const section of BASE_PRINCIPAL_OVERRIDE_SECTIONS) {
    if (Object.prototype.hasOwnProperty.call(currentOverrides, section)) {
      preserved[section] = structuredClone(currentOverrides[section]);
    } else {
      delete preserved[section];
    }
  }
  return preserved;
}

function preserveBasePrincipalTombstones(next: string[], current?: string[]): string[] {
  return [
    ...next.filter((path) => !isBasePrincipalSectionPath(path)),
    ...(current ?? []).filter(isBasePrincipalSectionPath),
  ];
}

function hasBasePrincipalState(config: IConfig | null): boolean {
  const overrides = cloneOverrides(config?.overrides);
  return (
    [...BASE_PRINCIPAL_OVERRIDE_SECTIONS].some((section) =>
      Object.prototype.hasOwnProperty.call(overrides, section),
    ) || (config?.tombstones ?? []).some(isBasePrincipalSectionPath)
  );
}

function unsetPath(obj: Record<string, unknown>, fieldPath: string): void {
  const parts = fieldPath.split('.');
  let current: unknown = obj;
  for (let i = 0; i < parts.length - 1; i += 1) {
    if (current == null || typeof current !== 'object' || Array.isArray(current)) {
      return;
    }
    current = (current as Record<string, unknown>)[parts[i]];
  }
  if (current && typeof current === 'object' && !Array.isArray(current)) {
    delete (current as Record<string, unknown>)[parts[parts.length - 1]];
  }
}

function setPath(obj: Record<string, unknown>, fieldPath: string, value: unknown): void {
  const parts = fieldPath.split('.');
  let current = obj;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = parts[i];
    const next = current[key];
    if (next == null || typeof next !== 'object' || Array.isArray(next)) {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }
  current[parts[parts.length - 1]] = value;
}

function applyFieldsMutation(
  overrides: Record<string, unknown>,
  resetPaths: string[],
  fields: Record<string, unknown>,
): Record<string, unknown> {
  for (const path of resetPaths) {
    assertValidFieldPath(path);
  }
  for (const path of Object.keys(fields)) {
    assertValidFieldPath(path);
  }
  const next = cloneOverrides(overrides);
  for (const path of canonicalizeResetPaths(resetPaths)) {
    unsetPath(next, path);
  }
  for (const [path, value] of Object.entries(fields)) {
    setPath(next, path, value);
  }
  return next;
}

function getTombstonePathsToClear(fieldPath: string): string[] {
  assertValidFieldPath(fieldPath);
  const parts = fieldPath.split('.');
  if (parts.length <= 1) {
    return [fieldPath];
  }
  const paths: string[] = [];
  let prefix = parts[0];
  for (let i = 1; i < parts.length; i += 1) {
    prefix = `${prefix}.${parts[i]}`;
    paths.push(prefix);
  }
  return paths;
}

function getPathAndDescendantsRegex(fieldPath: string): RegExp {
  return new RegExp(`^${escapeRegExp(fieldPath)}(?:\\.|$)`);
}

function nextTombstones(
  current: string[] | undefined,
  resetPaths: string[],
  fieldPaths: string[],
): string[] {
  const existing = current ?? [];
  const resetMatchers = canonicalizeResetPaths(resetPaths).map(getPathAndDescendantsRegex);
  const cleared = new Set(fieldPaths.flatMap(getTombstonePathsToClear));
  return existing.filter((tombstone) => {
    if (cleared.has(tombstone)) {
      return false;
    }
    return !resetMatchers.some((matcher) => matcher.test(tombstone));
  });
}

function tenantRevisionFilter(tenantId: string): Record<string, unknown> {
  if (tenantId.length > 0) {
    return { tenantId };
  }
  return { $or: [{ tenantId: { $exists: false } }, { tenantId: null }, { tenantId: '' }] };
}

function tenantPrincipalFilter(
  tenantId: string,
  principalType: PrincipalType,
  principalId: string,
): FilterQuery<IConfig> {
  return {
    principalType,
    principalId,
    ...tenantRevisionFilter(tenantId),
  };
}

function revisionScopeFilter(
  tenantId: string,
  principalType: PrincipalType,
  principalId: string,
): Record<string, unknown> {
  return {
    ...tenantRevisionFilter(tenantId),
    principalType,
    principalId,
  };
}

function interpretedConfigVersion(doc: { configVersion?: number | null } | null): number | null {
  if (doc == null) return null;
  return doc.configVersion ?? 0;
}

/** CAS filter: a missing/null configVersion is treated as 0 for legacy documents. */
function versionCasFilter(id: unknown, currentVersion: number | null): Record<string, unknown> {
  if (currentVersion === 0) {
    return {
      _id: id,
      $or: [{ configVersion: 0 }, { configVersion: null }, { configVersion: { $exists: false } }],
    };
  }
  return { _id: id, configVersion: currentVersion };
}

function snapshotFromConfig(
  current: IConfig | null,
  params: {
    cause: ConfigRevisionCause;
    actor: ConfigRevisionActor;
    principalType: PrincipalType;
    principalId: string;
  },
): ConfigRevisionSnapshot {
  return {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    cause: params.cause,
    actorId: params.actor.actorId,
    actorEmail: params.actor.actorEmail,
    tenantId: params.actor.tenantId,
    principalType: params.principalType,
    principalId: params.principalId,
    overrides: cloneOverrides(current?.overrides),
    tombstones: [...(current?.tombstones ?? [])],
    priority: current?.priority ?? null,
    isActive: current == null ? null : current.isActive,
    absent: current == null,
    configVersion: interpretedConfigVersion(current),
    status: 'final',
    committed: true,
  };
}

export function createConfigMethods(mongoose: typeof import('mongoose')): {
  listAllConfigs: (filter?: { isActive?: boolean }, session?: ClientSession) => Promise<IConfig[]>;
  findConfigByPrincipal: (
    principalType: PrincipalType,
    principalId: string | Types.ObjectId,
    options?: FindConfigByPrincipalOptions,
    session?: ClientSession,
  ) => Promise<IConfig | null>;
  getApplicableConfigs: (
    principals?: Array<{ principalType: string; principalId?: string | Types.ObjectId }>,
    session?: ClientSession,
  ) => Promise<IConfig[]>;
  upsertConfig: (
    principalType: PrincipalType,
    principalId: string | Types.ObjectId,
    principalModel: PrincipalModel,
    overrides: Partial<TCustomConfig>,
    priority: number,
    session?: ClientSession,
    options?: { expectEmpty?: boolean; preservePriority?: boolean },
  ) => Promise<IConfig | null>;
  patchConfigFields: (
    principalType: PrincipalType,
    principalId: string | Types.ObjectId,
    principalModel: PrincipalModel,
    fields: Record<string, unknown>,
    priority?: number,
    session?: ClientSession,
  ) => Promise<IConfig | null>;
  tombstoneConfigField: (
    principalType: PrincipalType,
    principalId: string | Types.ObjectId,
    principalModel: PrincipalModel,
    fieldPath: string,
    priority?: number,
    session?: ClientSession,
  ) => Promise<IConfig | null>;
  unsetConfigField: (
    principalType: PrincipalType,
    principalId: string | Types.ObjectId,
    fieldPath: string,
    session?: ClientSession,
  ) => Promise<IConfig | null>;
  deleteConfig: (
    principalType: PrincipalType,
    principalId: string | Types.ObjectId,
    session?: ClientSession,
    options?: { expectEmpty?: boolean },
  ) => Promise<IConfig | null>;
  toggleConfigActive: (
    principalType: PrincipalType,
    principalId: string | Types.ObjectId,
    isActive: boolean,
    session?: ClientSession,
    options?: { expectEmpty?: boolean },
  ) => Promise<IConfig | null>;
  mutateConfigWithRevision: (params: {
    principalType: PrincipalType;
    principalId: string | Types.ObjectId;
    principalModel: PrincipalModel;
    expectedVersion: number | null;
    op: ConfigMutationOp;
    cause: ConfigRevisionCause;
    actor: ConfigRevisionActor;
  }) => Promise<ConfigMutationResult>;
} {
  async function findConfigByPrincipal(
    principalType: PrincipalType,
    principalId: string | Types.ObjectId,
    options?: FindConfigByPrincipalOptions,
    session?: ClientSession,
  ): Promise<IConfig | null> {
    const Config = mongoose.models.Config as Model<IConfig>;
    const filter: FilterQuery<IConfig> = {
      principalType,
      principalId: principalId.toString(),
    };
    if (options?.tenantId !== undefined) {
      Object.assign(filter, tenantRevisionFilter(options.tenantId));
    }
    if (!options?.includeInactive) {
      filter.isActive = true;
    }
    return await Config.findOne(filter)
      .session(session ?? null)
      .lean<IConfig>();
  }

  async function listAllConfigs(
    filter?: { isActive?: boolean },
    session?: ClientSession,
  ): Promise<IConfig[]> {
    const Config = mongoose.models.Config as Model<IConfig>;
    const where: { isActive?: boolean } = {};
    if (filter?.isActive !== undefined) {
      where.isActive = filter.isActive;
    }
    return await Config.find(where)
      .sort({ priority: 1 })
      .session(session ?? null)
      .lean<IConfig[]>();
  }

  async function getApplicableConfigs(
    principals?: Array<{ principalType: string; principalId?: string | Types.ObjectId }>,
    session?: ClientSession,
  ): Promise<IConfig[]> {
    const Config = mongoose.models.Config as Model<IConfig>;

    const basePrincipal = {
      principalType: PrincipalType.ROLE as string,
      principalId: BASE_CONFIG_PRINCIPAL_ID,
    };

    const principalsQuery = [basePrincipal];

    if (principals && principals.length > 0) {
      for (const p of principals) {
        if (p.principalId !== undefined) {
          principalsQuery.push({
            principalType: p.principalType,
            principalId: p.principalId.toString(),
          });
        }
      }
    }

    return await Config.find({
      $or: principalsQuery,
      isActive: true,
    })
      .sort({ priority: 1 })
      .session(session ?? null)
      .lean<IConfig[]>();
  }

  async function upsertConfig(
    principalType: PrincipalType,
    principalId: string | Types.ObjectId,
    principalModel: PrincipalModel,
    overrides: Partial<TCustomConfig>,
    priority: number,
    session?: ClientSession,
    options?: { expectEmpty?: boolean; preservePriority?: boolean },
  ): Promise<IConfig | null> {
    const Config = mongoose.models.Config as Model<IConfig>;
    const principalIdString = principalId.toString();
    const isBase = isBaseConfigPrincipal(principalType, principalIdString);

    const query: FilterQuery<IConfig> = {
      principalType,
      principalId: principalIdString,
    };
    if (options?.expectEmpty) {
      query.$and = [
        { $or: [{ overrides: { $eq: {} } }, { overrides: { $exists: false } }] },
        { $or: [{ tombstones: { $size: 0 } }, { tombstones: { $exists: false } }] },
      ];
    }

    if (!isBase) {
      const update = {
        $set: {
          principalModel,
          overrides,
          ...(options?.preservePriority ? {} : { priority }),
          isActive: true,
        },
        ...(options?.preservePriority ? { $setOnInsert: { priority } } : {}),
        $inc: { configVersion: 1 },
      };
      const mongoOptions = {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
        ...(session ? { session } : {}),
      };
      try {
        return await Config.findOneAndUpdate(query, update, mongoOptions);
      } catch (err: unknown) {
        if ((err as { code?: number }).code === 11000) {
          if (options?.expectEmpty) {
            return null;
          }
          return await Config.findOneAndUpdate(
            { principalType, principalId: principalIdString },
            { $set: update.$set, $inc: update.$inc },
            { new: true, ...(session ? { session } : {}) },
          );
        }
        throw err;
      }
    }

    return withOwnedSession(Config, session, async (txn) => {
      const current = await Config.findOne(query, null, { session: txn });
      if (!current) {
        const configVersion = await allocateBaseConfigVersion(Config, txn);
        try {
          const created = await Config.create(
            [
              {
                principalType,
                principalId: principalIdString,
                principalModel,
                overrides,
                priority,
                isActive: true,
                configVersion,
                tombstones: [],
              },
            ],
            { ...(txn ? { session: txn } : {}) },
          );
          return created[0] ?? null;
        } catch (err: unknown) {
          if ((err as { code?: number }).code === 11000 && options?.expectEmpty) {
            return null;
          }
          throw err;
        }
      }

      const currentVersion = interpretedConfigVersion(current);
      const nextVersion = (currentVersion ?? 0) + 1;
      if (!txn) await raiseBaseConfigVersionEpoch(Config, nextVersion, undefined);
      const updated = await Config.findOneAndUpdate(
        versionCasFilter(current._id, currentVersion),
        {
          $set: {
            principalModel,
            overrides,
            ...(options?.preservePriority ? {} : { priority }),
            isActive: true,
          },
          $inc: { configVersion: 1 },
        },
        { new: true, ...(txn ? { session: txn } : {}) },
      );
      if (!updated) {
        throw new Error('Failed to upsert base config after concurrent update');
      }
      if (txn) await raiseBaseConfigVersionEpoch(Config, nextVersion, txn);
      return updated;
    });
  }

  async function patchConfigFields(
    principalType: PrincipalType,
    principalId: string | Types.ObjectId,
    principalModel: PrincipalModel,
    fields: Record<string, unknown>,
    priority?: number,
    session?: ClientSession,
  ): Promise<IConfig | null> {
    for (const fieldPath of Object.keys(fields)) {
      assertValidFieldPath(fieldPath);
    }
    await ensureConfigIndexes(mongoose);
    const Config = mongoose.models.Config as Model<IConfig>;
    const principalIdString = principalId.toString();
    const isBase = isBaseConfigPrincipal(principalType, principalIdString);

    const applyOnce = async (txn?: ClientSession): Promise<IConfig | null | 'retry'> => {
      const current = await Config.findOne(
        { principalType, principalId: principalIdString },
        null,
        { session: txn },
      );
      const resolvedPriority = priority ?? current?.priority ?? DEFAULT_CONFIG_PRIORITY;
      const sanitizedCurrentOverrides = sanitizeAdminConfigOverrides(
        cloneOverrides(current?.overrides),
      );
      const sanitizedCurrentTombstones = sanitizeAdminConfigTombstones(current?.tombstones);
      const nextOverrides = sanitizeAdminConfigOverrides(
        applyFieldsMutation(sanitizedCurrentOverrides, [], fields),
      );
      const nextTombstonesValue = nextTombstones(
        sanitizedCurrentTombstones,
        [],
        Object.keys(fields),
      );

      if (!current) {
        const configVersion = isBase ? await allocateBaseConfigVersion(Config, txn) : 1;
        try {
          const created = await Config.create(
            [
              {
                principalType,
                principalId: principalIdString,
                principalModel,
                overrides: nextOverrides,
                tombstones: nextTombstonesValue,
                priority: resolvedPriority,
                isActive: true,
                configVersion,
              },
            ],
            { ...(txn ? { session: txn } : {}) },
          );
          return created[0] ?? null;
        } catch (error: unknown) {
          if ((error as { code?: number }).code === 11000) {
            return 'retry';
          }
          throw error;
        }
      }

      const currentVersion = interpretedConfigVersion(current);
      const nextVersion = (currentVersion ?? 0) + 1;
      if (isBase && !txn) await raiseBaseConfigVersionEpoch(Config, nextVersion, undefined);
      const updated = await Config.findOneAndUpdate(
        versionCasFilter(current._id, currentVersion),
        {
          $set: {
            principalModel,
            priority: resolvedPriority,
            overrides: nextOverrides,
            tombstones: nextTombstonesValue,
            isActive: current.isActive ?? true,
          },
          $inc: { configVersion: 1 },
        },
        { new: true, ...(txn ? { session: txn } : {}) },
      );
      if (!updated) {
        return 'retry';
      }
      if (isBase && txn) await raiseBaseConfigVersionEpoch(Config, nextVersion, txn);
      return updated;
    };

    if (isBase) {
      for (let attempt = 0; attempt < MAX_CONFIG_CAS_RETRIES; attempt += 1) {
        const result = await withOwnedSession(Config, session, (txn) => applyOnce(txn));
        if (result !== 'retry') {
          return result;
        }
      }
      throw new Error('Failed to patch config fields after concurrent update retries');
    }

    for (let attempt = 0; attempt < MAX_CONFIG_CAS_RETRIES; attempt += 1) {
      const result = await applyOnce(session);
      if (result !== 'retry') {
        return result;
      }
    }
    throw new Error('Failed to patch config fields after concurrent update retries');
  }

  async function tombstoneConfigField(
    principalType: PrincipalType,
    principalId: string | Types.ObjectId,
    principalModel: PrincipalModel,
    fieldPath: string,
    priority?: number,
    session?: ClientSession,
  ): Promise<IConfig | null> {
    assertValidFieldPath(fieldPath);
    await ensureConfigIndexes(mongoose);
    const Config = mongoose.models.Config as Model<IConfig>;
    const principalIdString = principalId.toString();
    const isBase = isBaseConfigPrincipal(principalType, principalIdString);

    const applyOnce = async (txn?: ClientSession): Promise<IConfig | null | 'retry'> => {
      const current = await Config.findOne(
        { principalType, principalId: principalIdString },
        null,
        { session: txn },
      );
      const resolvedPriority = priority ?? current?.priority ?? DEFAULT_CONFIG_PRIORITY;
      const sanitizedCurrentOverrides = sanitizeAdminConfigOverrides(
        cloneOverrides(current?.overrides),
      );
      const nextOverrides = applyFieldsMutation(sanitizedCurrentOverrides, [fieldPath], {});
      const nextTombstoneSet = new Set(sanitizeAdminConfigTombstones(current?.tombstones));
      nextTombstoneSet.add(fieldPath);
      const nextTombstonesValue = [...nextTombstoneSet];

      if (!current) {
        const configVersion = isBase ? await allocateBaseConfigVersion(Config, txn) : 1;
        try {
          const created = await Config.create(
            [
              {
                principalType,
                principalId: principalIdString,
                principalModel,
                overrides: nextOverrides,
                tombstones: nextTombstonesValue,
                priority: resolvedPriority,
                isActive: true,
                configVersion,
              },
            ],
            { ...(txn ? { session: txn } : {}) },
          );
          return created[0] ?? null;
        } catch (error: unknown) {
          if ((error as { code?: number }).code === 11000) {
            return 'retry';
          }
          throw error;
        }
      }

      const currentVersion = interpretedConfigVersion(current);
      const nextVersion = (currentVersion ?? 0) + 1;
      if (isBase && !txn) await raiseBaseConfigVersionEpoch(Config, nextVersion, undefined);
      const updated = await Config.findOneAndUpdate(
        versionCasFilter(current._id, currentVersion),
        {
          $set: {
            principalModel,
            priority: resolvedPriority,
            overrides: nextOverrides,
            tombstones: nextTombstonesValue,
            isActive: current.isActive ?? true,
          },
          $inc: { configVersion: 1 },
        },
        { new: true, ...(txn ? { session: txn } : {}) },
      );
      if (!updated) {
        return 'retry';
      }
      if (isBase && txn) await raiseBaseConfigVersionEpoch(Config, nextVersion, txn);
      return updated;
    };

    if (isBase) {
      for (let attempt = 0; attempt < MAX_CONFIG_CAS_RETRIES; attempt += 1) {
        const result = await withOwnedSession(Config, session, (txn) => applyOnce(txn));
        if (result !== 'retry') {
          return result;
        }
      }
      throw new Error('Failed to tombstone config field after concurrent update retries');
    }

    for (let attempt = 0; attempt < MAX_CONFIG_CAS_RETRIES; attempt += 1) {
      const result = await applyOnce(session);
      if (result !== 'retry') {
        return result;
      }
    }
    throw new Error('Failed to tombstone config field after concurrent update retries');
  }

  async function unsetConfigField(
    principalType: PrincipalType,
    principalId: string | Types.ObjectId,
    fieldPath: string,
    session?: ClientSession,
  ): Promise<IConfig | null> {
    assertValidFieldPath(fieldPath);
    const Config = mongoose.models.Config as Model<IConfig>;
    const principalIdString = principalId.toString();
    const isBase = isBaseConfigPrincipal(principalType, principalIdString);

    const apply = async (txn?: ClientSession): Promise<IConfig | null | 'retry'> => {
      if (!txn && isBase) {
        const current = await Config.findOne({ principalType, principalId: principalIdString });
        if (!current) return null;
        const currentVersion = interpretedConfigVersion(current);
        const nextVersion = (currentVersion ?? 0) + 1;
        await raiseBaseConfigVersionEpoch(Config, nextVersion, undefined);
        const updated = await Config.findOneAndUpdate(
          versionCasFilter(current._id, currentVersion),
          {
            $unset: { [`overrides.${fieldPath}`]: '' },
            $pull: { tombstones: { $regex: getPathAndDescendantsRegex(fieldPath) } },
            $inc: { configVersion: 1 },
          },
          { new: true },
        );
        if (!updated) return 'retry';
        return updated;
      }
      const updated = await Config.findOneAndUpdate(
        { principalType, principalId: principalIdString },
        {
          $unset: { [`overrides.${fieldPath}`]: '' },
          $pull: { tombstones: { $regex: getPathAndDescendantsRegex(fieldPath) } },
          $inc: { configVersion: 1 },
        },
        { new: true, ...(txn ? { session: txn } : {}) },
      );
      if (updated && isBase && txn) {
        await raiseBaseConfigVersionEpoch(Config, updated.configVersion ?? 0, txn);
      }
      return updated;
    };

    if (isBase) {
      for (let attempt = 0; attempt < MAX_CONFIG_CAS_RETRIES; attempt += 1) {
        const result = await withOwnedSession(Config, session, (txn) => apply(txn));
        if (result !== 'retry') return result;
      }
      throw new Error('Failed to unset config field after concurrent update retries');
    }
    return apply(session) as Promise<IConfig | null>;
  }

  async function deleteConfig(
    principalType: PrincipalType,
    principalId: string | Types.ObjectId,
    session?: ClientSession,
    options?: { expectEmpty?: boolean },
  ): Promise<IConfig | null> {
    const Config = mongoose.models.Config as Model<IConfig>;
    const principalIdString = principalId.toString();
    const isBase = isBaseConfigPrincipal(principalType, principalIdString);
    const filter: FilterQuery<IConfig> = {
      principalType,
      principalId: principalIdString,
    };
    if (options?.expectEmpty) {
      filter.$and = [
        { $or: [{ overrides: { $eq: {} } }, { overrides: { $exists: false } }] },
        { $or: [{ tombstones: { $size: 0 } }, { tombstones: { $exists: false } }] },
      ];
    }

    const apply = async (txn?: ClientSession): Promise<IConfig | null | 'retry'> => {
      if (!txn && isBase) {
        const current = await Config.findOne({ principalType, principalId: principalIdString });
        if (!current) return null;
        if (options?.expectEmpty) {
          const hasOverrides =
            current.overrides != null && Object.keys(current.overrides).length > 0;
          const hasTombstones = current.tombstones != null && current.tombstones.length > 0;
          if (hasOverrides || hasTombstones) return null;
        }
        const version = interpretedConfigVersion(current);
        if (version != null) {
          await raiseBaseConfigVersionEpoch(Config, version, undefined);
        }
        const deleted = await Config.findOneAndDelete(versionCasFilter(current._id, version));
        if (!deleted) return 'retry';
        return deleted;
      }
      const deleted = await Config.findOneAndDelete(filter, txn ? { session: txn } : {});
      if (deleted && isBase && txn) {
        const deletedVersion = interpretedConfigVersion(deleted);
        if (deletedVersion != null) {
          await raiseBaseConfigVersionEpoch(Config, deletedVersion, txn);
        }
      }
      return deleted;
    };

    if (isBase) {
      for (let attempt = 0; attempt < MAX_CONFIG_CAS_RETRIES; attempt += 1) {
        const result = await withOwnedSession(Config, session, (txn) => apply(txn));
        if (result !== 'retry') return result;
      }
      throw new Error('Failed to delete base config after concurrent update retries');
    }
    return apply(session) as Promise<IConfig | null>;
  }

  async function toggleConfigActive(
    principalType: PrincipalType,
    principalId: string | Types.ObjectId,
    isActive: boolean,
    session?: ClientSession,
    options?: { expectEmpty?: boolean },
  ): Promise<IConfig | null> {
    const Config = mongoose.models.Config as Model<IConfig>;
    const principalIdString = principalId.toString();
    const isBase = isBaseConfigPrincipal(principalType, principalIdString);
    const filter: FilterQuery<IConfig> = {
      principalType,
      principalId: principalIdString,
    };
    if (options?.expectEmpty) {
      filter.$and = [
        { $or: [{ overrides: { $eq: {} } }, { overrides: { $exists: false } }] },
        { $or: [{ tombstones: { $size: 0 } }, { tombstones: { $exists: false } }] },
      ];
    }

    const apply = async (txn?: ClientSession): Promise<IConfig | null | 'retry'> => {
      if (!txn && isBase) {
        const current = await Config.findOne({ principalType, principalId: principalIdString });
        if (!current) return null;
        if (options?.expectEmpty) {
          const hasOverrides =
            current.overrides != null && Object.keys(current.overrides).length > 0;
          const hasTombstones = current.tombstones != null && current.tombstones.length > 0;
          if (hasOverrides || hasTombstones) return null;
        }
        const currentVersion = interpretedConfigVersion(current);
        const nextVersion = (currentVersion ?? 0) + 1;
        await raiseBaseConfigVersionEpoch(Config, nextVersion, undefined);
        const updated = await Config.findOneAndUpdate(
          versionCasFilter(current._id, currentVersion),
          { $set: { isActive }, $inc: { configVersion: 1 } },
          { new: true },
        );
        if (!updated) return 'retry';
        return updated;
      }
      const updated = await Config.findOneAndUpdate(
        filter,
        { $set: { isActive }, $inc: { configVersion: 1 } },
        { new: true, ...(txn ? { session: txn } : {}) },
      );
      if (updated && isBase && txn) {
        await raiseBaseConfigVersionEpoch(Config, updated.configVersion ?? 0, txn);
      }
      return updated;
    };

    if (isBase) {
      for (let attempt = 0; attempt < MAX_CONFIG_CAS_RETRIES; attempt += 1) {
        const result = await withOwnedSession(Config, session, (txn) => apply(txn));
        if (result !== 'retry') return result;
      }
      throw new Error('Failed to toggle base config after concurrent update retries');
    }
    return apply(session) as Promise<IConfig | null>;
  }

  async function mutateConfigWithRevision(params: {
    principalType: PrincipalType;
    principalId: string | Types.ObjectId;
    principalModel: PrincipalModel;
    expectedVersion: number | null;
    op: ConfigMutationOp;
    cause: ConfigRevisionCause;
    actor: ConfigRevisionActor;
  }): Promise<ConfigMutationResult> {
    const Config = mongoose.models.Config as Model<IConfig>;
    const principalId = params.principalId.toString();
    if (params.principalType !== PrincipalType.ROLE || principalId !== BASE_CONFIG_PRINCIPAL_ID) {
      throw new Error('Atomic config revisions are only supported for the base configuration');
    }

    const revisions = Config.db.collection(ADMIN_CONFIG_REVISIONS_COLLECTION);
    const session = await Config.db.startSession();
    const scope = revisionScopeFilter(params.actor.tenantId, params.principalType, principalId);
    const principalFilter = tenantPrincipalFilter(
      params.actor.tenantId,
      params.principalType,
      principalId,
    );

    const raiseVersionEpoch = async (version: number) => {
      await raiseBaseConfigVersionEpoch(Config, version, session, params.actor.tenantId);
    };

    const allocateCreateVersion = async (): Promise<number> =>
      allocateBaseConfigVersion(Config, session, params.actor.tenantId);

    try {
      // Return the outcome from withTransaction so each retry attempt gets a
      // fresh local result — a shared outer `outcome` would skip revision
      // insertOne after TransientTransactionError retries.
      const outcome = await session.withTransaction(async (): Promise<ConfigMutationResult> => {
        const current = await Config.findOne(principalFilter, null, { session });
        const currentVersion = interpretedConfigVersion(current);
        const versionMatches =
          current == null
            ? params.expectedVersion == null
            : params.expectedVersion === currentVersion;
        if (!versionMatches) {
          throw new ConfigVersionConflictError(currentVersion);
        }

        const { op } = params;
        const revision = snapshotFromConfig(current, {
          cause: params.cause,
          actor: params.actor,
          principalType: params.principalType,
          principalId,
        });

        let config: IConfig | null = current;

        const applyReplace = async (state: {
          overrides: Record<string, unknown>;
          tombstones: string[];
          priority: number;
          isActive: boolean;
        }) => {
          const nextOverrides = preserveBasePrincipalOverrides(state.overrides, current?.overrides);
          const nextTombstones = preserveBasePrincipalTombstones(
            state.tombstones,
            current?.tombstones,
          );
          if (current == null) {
            const configVersion = await allocateCreateVersion();
            const created = await Config.create(
              [
                {
                  principalType: params.principalType,
                  principalId,
                  principalModel: params.principalModel,
                  overrides: nextOverrides,
                  tombstones: nextTombstones,
                  priority: state.priority,
                  isActive: state.isActive,
                  configVersion,
                  ...(params.actor.tenantId.length > 0 ? { tenantId: params.actor.tenantId } : {}),
                },
              ],
              { session },
            );
            config = created[0] ?? null;
            return;
          }
          const nextVersion = (currentVersion ?? 0) + 1;
          const updated = await Config.findOneAndUpdate(
            versionCasFilter(current._id, currentVersion),
            {
              $set: {
                principalModel: params.principalModel,
                overrides: nextOverrides,
                tombstones: nextTombstones,
                priority: state.priority,
                isActive: state.isActive,
              },
              $inc: { configVersion: 1 },
            },
            { session, new: true },
          );
          if (!updated) {
            throw new ConfigVersionConflictError(currentVersion);
          }
          await raiseVersionEpoch(nextVersion);
          config = updated;
        };

        const applyDelete = async (): Promise<boolean> => {
          if (!current) {
            config = null;
            return false;
          }
          const deleted = await Config.deleteOne(versionCasFilter(current._id, currentVersion), {
            session,
          });
          if (deleted.deletedCount !== 1) {
            throw new ConfigVersionConflictError(currentVersion);
          }
          if (currentVersion != null) {
            await raiseVersionEpoch(currentVersion);
          }
          config = null;
          return true;
        };

        if (op.kind === 'restore') {
          const stored = (await revisions.findOne(
            {
              id: op.revisionId,
              status: { $ne: 'provisional' },
              $and: [
                tenantRevisionFilter(params.actor.tenantId),
                {
                  $or: [
                    { principalType: params.principalType, principalId },
                    {
                      principalType: { $exists: false },
                      principalId: { $exists: false },
                    },
                  ],
                },
              ],
            },
            { session },
          )) as ConfigRevisionSnapshot | null;
          if (!stored) {
            throw new ConfigRevisionNotFoundError(op.revisionId);
          }
          if (stored.absent) {
            if (hasBasePrincipalState(current)) {
              await applyReplace({
                overrides: {},
                tombstones: [],
                priority: current?.priority ?? 0,
                isActive: current?.isActive ?? true,
              });
            } else if (!(await applyDelete())) {
              return { changed: false, config: null, revision: null };
            }
          } else {
            await applyReplace({
              overrides: sanitizeAdminConfigOverrides(cloneOverrides(stored.overrides)),
              tombstones: sanitizeAdminConfigTombstones(stored.tombstones),
              priority: stored.priority ?? 0,
              isActive: stored.isActive ?? true,
            });
          }
        } else if (op.kind === 'delete') {
          if (hasBasePrincipalState(current)) {
            await applyReplace({
              overrides: {},
              tombstones: [],
              priority: current?.priority ?? 0,
              isActive: current?.isActive ?? true,
            });
          } else if (!(await applyDelete())) {
            return { changed: false, config: null, revision: null };
          }
        } else if (op.kind === 'replace') {
          await applyReplace({
            overrides: sanitizeAdminConfigOverrides(cloneOverrides(op.overrides)),
            tombstones: sanitizeAdminConfigTombstones(current?.tombstones),
            priority: op.priority,
            isActive: current?.isActive ?? true,
          });
        } else if (current == null) {
          // Reset-only against an absent base config is a no-op: do not create an
          // empty document / revision that would change persistent CAS state.
          if (Object.keys(op.fields).length === 0) {
            return { changed: false, config: null, revision: null };
          }
          await applyReplace({
            overrides: sanitizeAdminConfigOverrides(
              applyFieldsMutation({}, op.resetPaths, op.fields),
            ),
            tombstones: nextTombstones([], op.resetPaths, Object.keys(op.fields)),
            priority: op.priority,
            isActive: true,
          });
        } else {
          await applyReplace({
            overrides: sanitizeAdminConfigOverrides(
              applyFieldsMutation(
                sanitizeAdminConfigOverrides(cloneOverrides(current.overrides)),
                op.resetPaths,
                op.fields,
              ),
            ),
            tombstones: nextTombstones(
              sanitizeAdminConfigTombstones(current.tombstones),
              op.resetPaths,
              Object.keys(op.fields),
            ),
            priority: op.priority,
            isActive: current.isActive ?? true,
          });
        }

        await revisions.insertOne(revision, { session });
        return { changed: true, config, revision };
      });

      if (outcome.changed) {
        try {
          const stale = await revisions
            .find(
              { ...scope, status: { $ne: 'provisional' } },
              { projection: { id: 1 }, sort: { createdAt: -1 }, skip: MAX_CONFIG_REVISIONS },
            )
            .toArray();
          if (stale.length > 0) {
            await revisions.deleteMany({
              ...scope,
              id: { $in: stale.map((doc) => doc.id) },
            });
          }
        } catch {
          /* retention is best-effort after a committed mutation */
        }
      }

      return outcome;
    } catch (error) {
      if ((error as { code?: number }).code === 11000) {
        const Config = mongoose.models.Config as Model<IConfig>;
        const existing = await Config.findOne(principalFilter);
        throw new ConfigVersionConflictError(interpretedConfigVersion(existing));
      }
      if (isTransactionUnsupported(error)) {
        throw new TransactionRequiredError();
      }
      throw error;
    } finally {
      await session.endSession();
    }
  }

  return {
    listAllConfigs,
    findConfigByPrincipal,
    getApplicableConfigs,
    upsertConfig,
    patchConfigFields,
    tombstoneConfigField,
    unsetConfigField,
    deleteConfig,
    toggleConfigActive,
    mutateConfigWithRevision,
  };
}

export type ConfigMethods = ReturnType<typeof createConfigMethods>;
