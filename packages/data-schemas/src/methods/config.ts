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
 * Called in the same transaction as the Config create that persists the value.
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

/** Base writes require caller-owned CAS and revision metadata. */
function assertScopedConfigMutation(principalType: PrincipalType, principalId: string): void {
  if (isBaseConfigPrincipal(principalType, principalId)) {
    throw new Error('Base configuration writes must use mutateConfigWithRevision');
  }
}

/**
 * Refuses to initialize indexes when duplicate Config docs exist for the same
 * logical principal+tenant. Uses a fast path when the unique index already exists and all
 * legacy empty-string aliases have been canonicalized, so repeated pod startups
 * after migration complete do not scan the whole collection.
 *
 * Uses raw collection operations to bypass tenant-isolation middleware.
 * Groups by $ifNull so null, missing, and '' are all treated as the same logical
 * tenant. Duplicate configuration documents can contain complementary settings;
 * choosing either one automatically would irreversibly discard data, so startup
 * fails with the exact scopes and document IDs that an operator must reconcile.
 *
 * Canonical value for "no tenant" is null. MongoDB indexes null and absent fields
 * identically, so old-pod writes (missing tenantId) and new-pod writes (null)
 * collide correctly in the unique index during rolling deployments.
 */
async function validateConfigPrincipals(Config: Model<IConfig>): Promise<void> {
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

  // Full validation: index not yet built, or legacy '' aliases still present.
  // Validate before canonicalization so an existing ''/null alias pair is
  // reported explicitly instead of surfacing as a context-free E11000.
  // eslint-disable-next-line no-restricted-syntax -- cross-tenant migration; must bypass tenant middleware
  const duplicates = await Config.collection
    .aggregate<{
      _id: { principalType: string; principalId: string; tenantId: string };
      documentIds: Types.ObjectId[];
      count: number;
    }>([
      {
        $group: {
          _id: {
            principalType: '$principalType',
            principalId: '$principalId',
            tenantId: { $ifNull: ['$tenantId', ''] },
          },
          documentIds: { $push: '$_id' },
          count: { $sum: 1 },
        },
      },
      { $match: { count: { $gt: 1 } } },
      { $limit: 20 },
    ])
    .toArray();

  if (duplicates.length > 0) {
    const details = duplicates
      .map(
        ({ _id, documentIds }) =>
          `${_id.principalType}/${_id.principalId}/tenant:${_id.tenantId || '<default>'} ` +
          `[${documentIds.map((id) => id.toString()).join(', ')}]`,
      )
      .join('; ');
    throw new Error(
      'Duplicate configuration principals detected; no documents were modified. ' +
        `Reconcile these records before restart: ${details}`,
    );
  }

  // Canonicalize both missing and empty-string tenantId to null after validation.
  // There is at most one doc per logical principal, so this update
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
 * Validation runs first when the unique index is absent. Existing deployments
 * with logical duplicates fail closed instead of silently deleting one config.
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
        await validateConfigPrincipals(Config);
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

/**
 * `createIndex` throws (code 85/86) if an index already exists under `name`
 * with a different key spec — expected on a rolling upgrade from a version
 * that indexed this collection differently. Dropping and recreating makes
 * the change idempotent instead of failing every startup after this ships.
 * Concurrent workers can all observe the old definition before one drops it,
 * so a later drop may legitimately find that the index is already gone.
 */
async function createOrReplaceIndex(
  collection: ReturnType<Model<IConfig>['db']['collection']>,
  keys: Record<string, 1 | -1>,
  options: { name: string; unique?: boolean; background?: boolean },
): Promise<void> {
  try {
    await collection.createIndex(keys, options);
  } catch (err) {
    if ((err as { code?: number }).code === 85 || (err as { code?: number }).code === 86) {
      try {
        await collection.dropIndex(options.name);
      } catch (dropErr) {
        if ((dropErr as { code?: number }).code !== 27) {
          throw dropErr;
        }
      }
      await collection.createIndex(keys, options);
      return;
    }
    throw err;
  }
}

async function ensureRevisionCollectionIndexes(Config: Model<IConfig>): Promise<void> {
  const revisions = Config.db.collection(ADMIN_CONFIG_REVISIONS_COLLECTION);
  await Promise.all([
    createOrReplaceIndex(
      revisions,
      { id: 1 },
      { name: 'revision_id_lookup', unique: true, background: true },
    ),
    // configVersion is the monotonic, CAS-allocated pre-mutation version each
    // atomic revision records — createdAt alone is clock-derived and can tie
    // (or skew across pods), silently misordering retention/listing. Ordering
    // on configVersion first, createdAt and _id (unindexed, compared in
    // memory) as tiebreakers, gives a total order that doesn't depend on wall
    // clocks agreeing.
    createOrReplaceIndex(
      revisions,
      {
        tenantId: 1,
        principalType: 1,
        principalId: 1,
        status: 1,
        configVersion: -1,
        createdAt: -1,
      },
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

/**
 * Thrown when a legacy revision's stored overrides fail the API layer's
 * current validation policies (schema shape, process-backed MCP servers,
 * protected Langfuse headers, ...) — see `validateRestoredOverrides`. Import
 * and field-mode mutations already reject these at the door; restoring an
 * older revision must not be a way to reintroduce what they'd now reject.
 */
export class RestoreValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RestoreValidationError';
  }
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
  | {
      kind: 'fields';
      resetPaths: string[];
      fields: Record<string, unknown>;
      priority: number;
      /** Explicit isActive override (e.g. reactivating while patching fields
       * in one atomic write). Omitted/undefined preserves the current value,
       * matching every other mutation kind's default behavior. */
      isActive?: boolean;
    }
  | { kind: 'replace'; overrides: Record<string, unknown>; priority: number }
  | { kind: 'delete' }
  | { kind: 'active'; isActive: boolean }
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

export type ConfigRevisionListItem = Pick<
  ConfigRevisionSnapshot,
  'id' | 'createdAt' | 'cause' | 'actorId' | 'actorEmail'
>;

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
  if (path.includes('\0')) {
    return 'field path contains NUL byte';
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

/**
 * Guards `BASE_PRINCIPAL_CONFIG_SECTIONS` (e.g. `langfuse`) against every
 * base-config write path EXCEPT the one operation actually trusted to
 * maintain it — every caller of `mutateConfigWithRevision` targets the base
 * principal by construction (see the check above), so "is this a base-config
 * write" can't distinguish the dedicated Langfuse handler's legitimate
 * `fields` patch from a generic save/import/restore that must never be able
 * to smuggle a `langfuse` change past its own verification/encryption.
 * `trustedSections` is that explicit, per-call opt-in — omitted by every
 * caller except the one section owner it was written for.
 */
function preserveBasePrincipalOverrides(
  next: Record<string, unknown>,
  current: unknown,
  trustedSections: ReadonlySet<string> = new Set(),
): Record<string, unknown> {
  const preserved = cloneOverrides(next);
  const currentOverrides = cloneOverrides(current);
  for (const section of BASE_PRINCIPAL_OVERRIDE_SECTIONS) {
    if (trustedSections.has(section)) continue;
    if (Object.prototype.hasOwnProperty.call(currentOverrides, section)) {
      preserved[section] = structuredClone(currentOverrides[section]);
    } else {
      delete preserved[section];
    }
  }
  return preserved;
}

function preserveBasePrincipalTombstones(
  next: string[],
  current?: string[],
  trustedSections: ReadonlySet<string> = new Set(),
): string[] {
  const isProtected = (path: string) =>
    isBasePrincipalSectionPath(path) && !trustedSections.has(path.split('.')[0]);
  return [...next.filter((path) => !isProtected(path)), ...(current ?? []).filter(isProtected)];
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

/** Pure post-mutation state shared by atomic writes and pre-write validation.
 * In particular, a leaf write does not clear a whole-section tombstone. */
export function applyConfigFieldsMutation(
  current: { overrides?: Record<string, unknown>; tombstones?: string[] } | null | undefined,
  resetPaths: string[],
  fields: Record<string, unknown>,
): { overrides: Record<string, unknown>; tombstones: string[] } {
  return {
    overrides: sanitizeAdminConfigOverrides(
      applyFieldsMutation(
        sanitizeAdminConfigOverrides(cloneOverrides(current?.overrides ?? {})),
        resetPaths,
        fields,
      ),
    ),
    tombstones: nextTombstones(
      sanitizeAdminConfigTombstones(current?.tombstones),
      resetPaths,
      Object.keys(fields),
    ),
  };
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

/**
 * Read scope for revision history. Older admin-panel revisions predate the
 * principal metadata, but that panel only ever recorded role/__base__
 * snapshots, so they remain valid rollback points for the matching tenant.
 */
function revisionReadScopeFilter(
  tenantId: string,
  principalType: PrincipalType,
  principalId: string,
): Record<string, unknown> {
  return {
    $and: [
      tenantRevisionFilter(tenantId),
      {
        $or: [
          { principalType, principalId },
          {
            principalType: { $exists: false },
            principalId: { $exists: false },
          },
        ],
      },
    ],
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
    /** Pre-normalized stand-in for `current.overrides` (secrets encrypted at rest). */
    overridesOverride?: Record<string, unknown> | null;
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
    overrides: cloneOverrides(params.overridesOverride ?? current?.overrides),
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
    options?: Pick<FindConfigByPrincipalOptions, 'tenantId'>,
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
    normalizeSecrets?: (overrides: Record<string, unknown>) => Record<string, unknown>;
    trustedBasePrincipalSections?: string[];
    validateRestoredOverrides?: (
      overrides: Record<string, unknown>,
      tombstones: string[],
    ) => string | null;
  }) => Promise<ConfigMutationResult>;
  listConfigRevisions: (params: {
    principalType: PrincipalType;
    principalId: string | Types.ObjectId;
    tenantId: string;
    limit?: number;
  }) => Promise<ConfigRevisionListItem[]>;
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
    options?: Pick<FindConfigByPrincipalOptions, 'tenantId'>,
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

    const principalFilter = { $or: principalsQuery };
    const filter: FilterQuery<IConfig> =
      options?.tenantId !== undefined
        ? {
            $and: [principalFilter, tenantRevisionFilter(options.tenantId)],
            isActive: true,
          }
        : { ...principalFilter, isActive: true };

    return await Config.find(filter)
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
    assertScopedConfigMutation(principalType, principalIdString);

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
    const principalIdString = principalId.toString();
    assertScopedConfigMutation(principalType, principalIdString);
    await ensureConfigIndexes(mongoose);
    const Config = mongoose.models.Config as Model<IConfig>;

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
        const configVersion = 1;
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
      const updated = await Config.findOneAndUpdate(
        versionCasFilter(current._id, currentVersion),
        {
          $set: {
            principalModel,
            priority: resolvedPriority,
            overrides: nextOverrides,
            tombstones: nextTombstonesValue,
            isActive: current.isActive ?? true,
            configVersion: nextVersion,
          },
        },
        { new: true, ...(txn ? { session: txn } : {}) },
      );
      if (!updated) {
        return 'retry';
      }
      return updated;
    };

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
    const principalIdString = principalId.toString();
    assertScopedConfigMutation(principalType, principalIdString);
    await ensureConfigIndexes(mongoose);
    const Config = mongoose.models.Config as Model<IConfig>;

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
        const configVersion = 1;
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
      const updated = await Config.findOneAndUpdate(
        versionCasFilter(current._id, currentVersion),
        {
          $set: {
            principalModel,
            priority: resolvedPriority,
            overrides: nextOverrides,
            tombstones: nextTombstonesValue,
            isActive: current.isActive ?? true,
            configVersion: nextVersion,
          },
        },
        { new: true, ...(txn ? { session: txn } : {}) },
      );
      if (!updated) {
        return 'retry';
      }
      return updated;
    };

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
    assertScopedConfigMutation(principalType, principalIdString);

    return Config.findOneAndUpdate(
      { principalType, principalId: principalIdString },
      {
        $unset: { [`overrides.${fieldPath}`]: '' },
        $pull: { tombstones: { $regex: getPathAndDescendantsRegex(fieldPath) } },
        $inc: { configVersion: 1 },
      },
      { new: true, ...(session ? { session } : {}) },
    );
  }

  async function deleteConfig(
    principalType: PrincipalType,
    principalId: string | Types.ObjectId,
    session?: ClientSession,
    options?: { expectEmpty?: boolean },
  ): Promise<IConfig | null> {
    const Config = mongoose.models.Config as Model<IConfig>;
    const principalIdString = principalId.toString();
    assertScopedConfigMutation(principalType, principalIdString);
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

    return Config.findOneAndDelete(filter, session ? { session } : {});
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
    assertScopedConfigMutation(principalType, principalIdString);
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

    return Config.findOneAndUpdate(
      filter,
      { $set: { isActive }, $inc: { configVersion: 1 } },
      { new: true, ...(session ? { session } : {}) },
    );
  }

  async function listConfigRevisions(params: {
    principalType: PrincipalType;
    principalId: string | Types.ObjectId;
    tenantId: string;
    limit?: number;
  }): Promise<ConfigRevisionListItem[]> {
    const Config = mongoose.models.Config as Model<IConfig>;
    const revisions = Config.db.collection(ADMIN_CONFIG_REVISIONS_COLLECTION);
    const principalId = params.principalId.toString();
    const limit = Math.max(1, Math.min(params.limit ?? MAX_CONFIG_REVISIONS, MAX_CONFIG_REVISIONS));

    const docs = await revisions
      .find(
        {
          ...revisionReadScopeFilter(params.tenantId, params.principalType, principalId),
          status: { $ne: 'provisional' },
        },
        {
          projection: {
            _id: 0,
            id: 1,
            createdAt: 1,
            cause: 1,
            actorId: 1,
            actorEmail: 1,
          },
        },
      )
      .sort({ configVersion: -1, createdAt: -1, _id: -1 })
      .limit(limit)
      .toArray();

    return docs as unknown as ConfigRevisionListItem[];
  }

  async function mutateConfigWithRevision(params: {
    principalType: PrincipalType;
    principalId: string | Types.ObjectId;
    principalModel: PrincipalModel;
    expectedVersion: number | null;
    op: ConfigMutationOp;
    cause: ConfigRevisionCause;
    actor: ConfigRevisionActor;
    /**
     * Encrypts any plaintext legacy secret values in a stored overrides
     * document before it's copied into a revision snapshot or written back
     * from a restored revision. Must be idempotent on already-encrypted
     * values — injected by the API layer, which owns the config-secret
     * registry; data-schemas has no knowledge of which paths are secrets.
     */
    normalizeSecrets?: (overrides: Record<string, unknown>) => Record<string, unknown>;
    /**
     * Explicit, per-call opt-in letting this specific mutation write one or
     * more `BASE_PRINCIPAL_CONFIG_SECTIONS` (e.g. `['langfuse']`) that would
     * otherwise be silently preserved/stripped back to their current value —
     * see `preserveBasePrincipalOverrides`. Only the section's own dedicated
     * handler should ever pass this.
     */
    trustedBasePrincipalSections?: string[];
    /**
     * Validates a restore's normalized, pre-write overrides and tombstones against the API
     * layer's current policies (schema shape, process-backed MCP servers,
     * protected Langfuse headers, ...) — injected by the API layer, which
     * owns those rules; data-schemas has no knowledge of them. Returning a
     * message aborts the restore with a `RestoreValidationError` before any
     * write, matching what a direct field/import mutation with the same
     * content would reject. Only consulted for a non-absent restore; there's
     * nothing to validate when the snapshot is `absent`.
     */
    validateRestoredOverrides?: (
      overrides: Record<string, unknown>,
      tombstones: string[],
    ) => string | null;
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

        const normalizeSecrets = (
          overrides: unknown,
        ): Record<string, unknown> | null | undefined => {
          if (overrides == null || typeof overrides !== 'object' || !params.normalizeSecrets) {
            return overrides as Record<string, unknown> | null | undefined;
          }
          return params.normalizeSecrets(overrides as Record<string, unknown>);
        };

        const { op } = params;
        const revision = snapshotFromConfig(current, {
          cause: params.cause,
          actor: params.actor,
          principalType: params.principalType,
          principalId,
          overridesOverride: normalizeSecrets(current?.overrides),
        });

        let config: IConfig | null = current;
        const trustedBasePrincipalSections = new Set(params.trustedBasePrincipalSections ?? []);

        const applyReplace = async (state: {
          overrides: Record<string, unknown>;
          tombstones: string[];
          priority: number;
          isActive: boolean;
        }) => {
          const preservedOverrides = preserveBasePrincipalOverrides(
            state.overrides,
            current?.overrides,
            trustedBasePrincipalSections,
          );
          const nextOverrides = normalizeSecrets(preservedOverrides) ?? {};
          const nextTombstones = preserveBasePrincipalTombstones(
            state.tombstones,
            current?.tombstones,
            trustedBasePrincipalSections,
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
                configVersion: nextVersion,
              },
            },
            { session, new: true },
          );
          if (!updated) {
            throw new ConfigVersionConflictError(currentVersion);
          }
          await raiseVersionEpoch(nextVersion);
          config = updated;
        };

        /**
         * Logical absence is never represented by removing the document once
         * one has ever existed — only by a versioned, empty replace that retains
         * the document's active state. A true `deleteOne` would let a stale
         * `expectedVersion: null` reader race an absent → create → delete cycle
         * it never observed (the epoch only guards numeric version reuse, not a
         * return to absence). Before any document has ever been created there's
         * nothing to preserve a version for, so this is correctly still a no-op.
         */
        const applyAbsence = async (): Promise<boolean> => {
          if (!current) {
            config = null;
            return false;
          }
          await applyReplace({
            overrides: {},
            tombstones: [],
            priority: current.priority ?? DEFAULT_CONFIG_PRIORITY,
            isActive: current.isActive ?? true,
          });
          return true;
        };

        if (op.kind === 'active') {
          if (!current || current.isActive === op.isActive) {
            return { changed: false, config: null, revision: null };
          }
          await applyReplace({
            overrides: sanitizeAdminConfigOverrides(cloneOverrides(current.overrides)),
            tombstones: sanitizeAdminConfigTombstones(current.tombstones),
            priority: current.priority ?? DEFAULT_CONFIG_PRIORITY,
            isActive: op.isActive,
          });
        } else if (op.kind === 'restore') {
          const stored = (await revisions.findOne(
            {
              id: op.revisionId,
              status: { $ne: 'provisional' },
              ...revisionReadScopeFilter(params.actor.tenantId, params.principalType, principalId),
            },
            { session },
          )) as ConfigRevisionSnapshot | null;
          if (!stored) {
            throw new ConfigRevisionNotFoundError(op.revisionId);
          }
          if (stored.absent) {
            if (!(await applyAbsence())) {
              return { changed: false, config: null, revision: null };
            }
          } else {
            // Legacy (pre-atomic-mutate) panel revisions recorded only `overrides` —
            // `tombstones`/`priority`/`isActive` are genuinely absent at runtime
            // despite the type, not falsy-but-present. Falling back to a fixed
            // default for those would silently clear current tombstones or reset
            // priority/isActive beyond what the revision ever recorded; preserve
            // the live document's values for anything the snapshot didn't capture.
            const restoredOverrides = preserveBasePrincipalOverrides(
              sanitizeAdminConfigOverrides(cloneOverrides(normalizeSecrets(stored.overrides))),
              current?.overrides,
              trustedBasePrincipalSections,
            );
            const restoredTombstones = preserveBasePrincipalTombstones(
              sanitizeAdminConfigTombstones(stored.tombstones ?? current?.tombstones ?? []),
              current?.tombstones,
              trustedBasePrincipalSections,
            );
            const restoreValidationError = params.validateRestoredOverrides?.(
              restoredOverrides,
              restoredTombstones,
            );
            if (restoreValidationError) {
              throw new RestoreValidationError(restoreValidationError);
            }
            await applyReplace({
              overrides: restoredOverrides,
              tombstones: restoredTombstones,
              priority: stored.priority ?? current?.priority ?? 0,
              isActive: stored.isActive ?? current?.isActive ?? true,
            });
          }
        } else if (op.kind === 'delete') {
          if (!(await applyAbsence())) {
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
            ...applyConfigFieldsMutation(null, op.resetPaths, op.fields),
            priority: op.priority,
            isActive: op.isActive ?? true,
          });
        } else {
          await applyReplace({
            ...applyConfigFieldsMutation(current, op.resetPaths, op.fields),
            priority: op.priority,
            isActive: op.isActive ?? current.isActive ?? true,
          });
        }

        await revisions.insertOne(revision, { session });
        return { changed: true, config, revision };
      });

      if (outcome.changed) {
        try {
          // configVersion (monotonic, CAS-allocated) orders revisions correctly
          // even when createdAt ties or skews across pods — see
          // ensureRevisionCollectionIndexes. createdAt/_id break ties among
          // legacy revisions that predate configVersion being recorded.
          const stale = await revisions
            .find(
              { ...scope, status: { $ne: 'provisional' } },
              {
                projection: { id: 1 },
                sort: { configVersion: -1, createdAt: -1, _id: -1 },
                skip: MAX_CONFIG_REVISIONS,
              },
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
    listConfigRevisions,
    mutateConfigWithRevision,
  };
}

export type ConfigMethods = ReturnType<typeof createConfigMethods>;
