import { megabyte, mergeFileConfig } from 'librechat-data-provider';
import type { UserStorageUsageParams } from '@librechat/data-schemas';

export const FILE_STORAGE_LIMIT_ERROR_CODE = 'FILE_STORAGE_LIMIT_EXCEEDED';

export class FileStorageLimitError extends Error {
  readonly code: typeof FILE_STORAGE_LIMIT_ERROR_CODE = FILE_STORAGE_LIMIT_ERROR_CODE;
  readonly status = 413 as const;
  readonly storageLimit: number;
  readonly currentUsage: number;

  /**
   * Reports observed usage alongside the cap. A user already over the limit —
   * because an admin lowered it, or enabled quotas on an existing account — has no
   * other way to learn how much they must free before any write succeeds again.
   */
  constructor(storageLimit: number, currentUsage: number) {
    super(
      `storage limit exceeded. You are using ${formatBytes(currentUsage)} of your ${formatBytes(storageLimit)} storage limit. Delete files or ask an admin to raise the limit.`,
    );
    this.name = 'FileStorageLimitError';
    this.storageLimit = storageLimit;
    this.currentUsage = currentUsage;
  }
}

export function isFileStorageLimitError(error: unknown): error is FileStorageLimitError {
  return (
    error instanceof Error &&
    (error as Error & { code?: string }).code === FILE_STORAGE_LIMIT_ERROR_CODE
  );
}

declare const storageScopeBrand: unique symbol;

/**
 * Request-scoped quota context: who is being charged, under which tenant, against
 * which cap, and what this request has already committed.
 *
 * The brand means a scope can only come from {@link resolveStorageScope}. Code that
 * reduces or rebuilds a request (image-generation tools pass a stripped request to
 * the retention/persistence helpers) has to carry this value through; it cannot
 * assemble a plausible-looking substitute from the fields it happens to have kept.
 * Dropping the tenant that way is what silently gives a user a second, parallel
 * ledger, so it is a compile error rather than a runtime surprise.
 */
export type StorageScope = {
  readonly [storageScopeBrand]: true;
  readonly userId: string;
  readonly tenantId: string | undefined;
  /** Cap in bytes; `undefined` disables enforcement entirely. */
  readonly storageLimit: number | undefined;
  /** Usage per exclusion scope, so one request re-reads the ledger at most once each. */
  readonly usageByScope: Map<string, StorageUsageEntry>;
};

type StorageUsageEntry = {
  params: UserStorageUsageParams;
  currentUsage: number;
};

type ScopeSource = {
  tenantId?: string;
  user?: { id?: string; tenantId?: string };
  config?: { fileConfig?: Parameters<typeof mergeFileConfig>[0] };
};

/** Keyed by request identity so the scope neither mutates the request nor outlives it. */
const scopesByRequest: WeakMap<ScopeSource, StorageScope> = new WeakMap();

function formatBytes(bytes: number): string {
  if (bytes >= megabyte) {
    return `${Math.floor(bytes / megabyte)}MB`;
  }

  return `${bytes} bytes`;
}

function normalizeBytes(bytes: number | null | undefined): number {
  const value = Number(bytes ?? 0);
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return value;
}

/**
 * Resolves — and memoizes on the request — the scope every quota-checked write is
 * charged against. The request tenant outranks the user's own: remote-agent auth
 * authenticates users that carry no tenant of their own and supplies it per request.
 */
export function resolveStorageScope(req: ScopeSource): StorageScope {
  const cached = scopesByRequest.get(req);
  if (cached) {
    return cached;
  }

  const userId = req.user?.id;
  if (!userId) {
    throw new Error('Cannot resolve file storage scope without an authenticated user');
  }

  const scope = {
    userId,
    tenantId: req.tenantId ?? req.user?.tenantId,
    storageLimit: mergeFileConfig(req.config?.fileConfig).storageLimit,
    usageByScope: new Map<string, StorageUsageEntry>(),
  } as StorageScope;

  scopesByRequest.set(req, scope);
  return scope;
}

export type GetUserStorageUsage = (params: UserStorageUsageParams) => Promise<number>;

type UsageExclusion = Pick<UserStorageUsageParams, 'excludeFileId' | 'excludeSkillFile'>;

function getUsageCacheKey(params: UserStorageUsageParams): string {
  return JSON.stringify({
    tenantId: params.tenantId ?? null,
    excludeFileId: params.excludeFileId ?? null,
    excludeSkillFile: params.excludeSkillFile
      ? {
          id: params.excludeSkillFile.id?.toString() ?? null,
          skillId: params.excludeSkillFile.skillId?.toString() ?? null,
          relativePath: params.excludeSkillFile.relativePath ?? null,
        }
      : null,
  });
}

function idsMatch(
  left?: { toString(): string } | string | null,
  right?: { toString(): string } | string | null,
): boolean {
  return left != null && right != null && left.toString() === right.toString();
}

function skillFilesMatch(
  excluded: UserStorageUsageParams['excludeSkillFile'],
  written: UserStorageUsageParams['excludeSkillFile'],
): boolean {
  if (!excluded || !written) {
    return false;
  }
  if (idsMatch(excluded.id, written.id)) {
    return true;
  }
  return (
    idsMatch(excluded.skillId, written.skillId) &&
    excluded.relativePath != null &&
    excluded.relativePath === written.relativePath
  );
}

/**
 * Soft gate: blocks writes once observed usage reaches the cap. Concurrent requests
 * can each pass before either has committed its row, so the cap is approximate under
 * parallel uploads by one user — bounded by their in-flight request count.
 */
async function assertWithinLimit(
  scope: StorageScope,
  incomingBytes: number,
  exclusion: UsageExclusion,
  getUserStorageUsage: GetUserStorageUsage,
): Promise<void> {
  if (scope.storageLimit === undefined) {
    return;
  }

  const params: UserStorageUsageParams = {
    userId: scope.userId,
    tenantId: scope.tenantId,
    ...exclusion,
  };
  const cacheKey = getUsageCacheKey(params);
  let entry = scope.usageByScope.get(cacheKey);
  if (entry === undefined) {
    entry = { params, currentUsage: await getUserStorageUsage(params) };
    scope.usageByScope.set(cacheKey, entry);
  }

  if (entry.currentUsage + incomingBytes <= scope.storageLimit) {
    return;
  }

  throw new FileStorageLimitError(scope.storageLimit, entry.currentUsage);
}

/**
 * Charges bytes this request has committed onto every cached scope that would count
 * them, so a second write in the same request sees the first without re-querying.
 * Scopes excluding the row just written are left alone — their totals already omit it.
 */
function recordCommittedBytes(scope: StorageScope, bytes: number, written: UsageExclusion): void {
  if (bytes === 0) {
    return;
  }

  scope.usageByScope.forEach((entry) => {
    const excludesThisRow =
      idsMatch(entry.params.excludeFileId, written.excludeFileId) ||
      skillFilesMatch(entry.params.excludeSkillFile, written.excludeSkillFile);
    if (excludesThisRow) {
      return;
    }
    entry.currentUsage += bytes;
  });
}

/**
 * Undo for side effects performed before the row was offered to the ledger — the
 * stored blob, the provider-side upload. `null` states that there is nothing to undo,
 * so a caller that does have something to clean up cannot reach the write by
 * forgetting the argument.
 */
export type StorageRollback = (() => Promise<void> | void) | null;

type LedgerRow = {
  bytes?: number | null;
  tenantId?: string;
};

/** Field naming the row's owner: `File` charges `user`, `SkillFile` charges `author`. */
type OwnerField = 'user' | 'author';

export type PersistParams<TRow extends LedgerRow, TResult> = {
  scope: StorageScope;
  /** Row as the caller built it; the ledger stamps owner and tenant before writing. */
  row: TRow;
  /** Performs the actual write, receiving the stamped row. */
  write: (row: TRow) => Promise<TResult>;
  rollback: StorageRollback;
  getUserStorageUsage: GetUserStorageUsage;
  /**
   * Size of the row this write replaces, when replacing one. Cached usage totals that
   * do not exclude the replaced row already contain its old bytes, so only the
   * difference may be added to them — charging the full new size would count both
   * versions and reject later writes that actually fit.
   */
  replacedBytes?: number | null;
};

async function runRollback(rollback: StorageRollback, onError: (error: unknown) => void) {
  if (!rollback) {
    return;
  }
  try {
    await rollback();
  } catch (error) {
    onError(error);
  }
}

/**
 * The sanctioned path to a quota-bearing file row.
 *
 * Charging, tenant stamping, request-scoped accounting and rollback all happen here
 * rather than at the call site, because this is the only point where the byte count
 * that will actually be persisted, the tenant it will be persisted under, and the
 * row's identity are all known at once. Gating before the write — where callers hold
 * only a raw upload size and a half-built row — is what made byte counts, tenants and
 * cleanup drift apart across every path that can create a file.
 */
async function persistWithQuota<TRow extends LedgerRow, TResult>(
  { scope, row, write, rollback, getUserStorageUsage, replacedBytes }: PersistParams<TRow, TResult>,
  exclusionFor: (row: TRow) => UsageExclusion,
  ownerField: OwnerField,
  onRollbackError: (error: unknown) => void,
): Promise<TResult> {
  /* Owner and tenant both come from the scope. A row written to a different owner's
   * ledger than the one just checked would leave that owner's usage unenforced, so the
   * queried ledger and the written ledger are made the same by construction. */
  const scopedRow: TRow = { ...row, [ownerField]: scope.userId, tenantId: scope.tenantId };
  const bytes = normalizeBytes(scopedRow.bytes);
  const exclusion = exclusionFor(scopedRow);

  try {
    await assertWithinLimit(scope, bytes, exclusion, getUserStorageUsage);
  } catch (error) {
    if (isFileStorageLimitError(error)) {
      await runRollback(rollback, onRollbackError);
    }
    throw error;
  }

  const result = await write(scopedRow);
  recordCommittedBytes(scope, bytes - normalizeBytes(replacedBytes), exclusion);
  return result;
}

export type FileRow = LedgerRow & {
  file_id?: string;
  user?: string;
};

type SkillFileExclusion = NonNullable<UserStorageUsageParams['excludeSkillFile']>;

export type SkillFileRow = LedgerRow & {
  skillId?: SkillFileExclusion['skillId'];
  relativePath?: string;
  author?: { toString(): string } | string;
};

/**
 * Persists a `File` row under this request's storage scope.
 *
 * The row replacing an existing `file_id` is excluded from its own usage total, so
 * re-uploading over a file is charged the difference rather than the full size twice.
 */
export function persistFileWithQuota<TRow extends FileRow, TResult>(
  params: PersistParams<TRow, TResult>,
  onRollbackError: (error: unknown) => void,
): Promise<TResult> {
  return persistWithQuota(
    params,
    (row) => ({ excludeFileId: row.file_id }),
    'user',
    onRollbackError,
  );
}

/**
 * Persists a `SkillFile` row under this request's storage scope.
 *
 * Skill files are charged to their author, not to everyone who runs the skill, and a
 * file replacing one the requester already authored is excluded from its own total.
 * A row authored by somebody else stays on that author's ledger and is not discounted.
 */
export function persistSkillFileWithQuota<TRow extends SkillFileRow, TResult>(
  params: PersistParams<TRow, TResult> & { replacing?: { author?: unknown } | null },
  onRollbackError: (error: unknown) => void,
): Promise<TResult> {
  const { replacing, ...rest } = params;
  return persistWithQuota(
    rest,
    (row) => {
      const replacedByAuthor =
        replacing != null && idsMatch(replacing.author as string, params.scope.userId);
      if (!replacedByAuthor || row.skillId == null || row.relativePath == null) {
        return {};
      }
      return {
        excludeSkillFile: { skillId: row.skillId, relativePath: row.relativePath },
      };
    },
    'author',
    onRollbackError,
  );
}
