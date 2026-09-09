import { megabyte, mergeFileConfig } from 'librechat-data-provider';

export const FILE_STORAGE_LIMIT_ERROR_CODE = 'FILE_STORAGE_LIMIT_EXCEEDED';

export class FileStorageLimitError extends Error {
  readonly code: typeof FILE_STORAGE_LIMIT_ERROR_CODE = FILE_STORAGE_LIMIT_ERROR_CODE;
  readonly status = 413 as const;
  readonly statusCode = 413 as const;
  readonly userErrorStatusCode = 413 as const;
  readonly body: { message: string };
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
    this.body = { message: this.message };
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
  /** Unexcluded ledger total, loaded once and adjusted as this request commits writes. */
  currentUsage?: number;
  /** In-flight ledger read, shared by concurrent writes in this request. */
  pendingRead?: Promise<number>;
  /** Last size committed for each replacement identity during this request. */
  replacementBytes?: Map<string, number>;
  /** Serializes writes that replace the same row identity. */
  replacementLocks?: Map<string, Promise<void>>;
};

type ScopeSource = {
  tenantId?: string;
  user?: { id?: string; tenantId?: string };
  /**
   * Resolved app config. Required, because it is what distinguishes a real request
   * from a reduced copy of one: without it there is no way to tell "no cap is
   * configured" from "this object never carried the cap", and the second silently
   * disables the quota.
   */
  config: { fileConfig?: Parameters<typeof mergeFileConfig>[0] };
};

/** Keyed by request identity so the scope neither mutates the request nor outlives it. */
const scopesByRequest: WeakMap<ScopeSource, StorageScope> = new WeakMap();
const localQuotaLocks = new Map<string, Promise<void>>();

async function withStorageQuotaLock<T>(
  scope: StorageScope,
  getUserStorageUsage: GetUserStorageUsage,
  operation: (assertHeld: () => Promise<void>) => Promise<T>,
): Promise<T> {
  if (scope.storageLimit === undefined) {
    return operation(async () => undefined);
  }
  const key = JSON.stringify([scope.userId, scope.tenantId ?? null]);
  if (!getUserStorageUsage.withLock) {
    const previous = localQuotaLocks.get(key) ?? Promise.resolve();
    let release = () => {};
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    localQuotaLocks.set(key, current);
    await previous;
    try {
      return await operation(async () => undefined);
    } finally {
      release();
      if (localQuotaLocks.get(key) === current) {
        localQuotaLocks.delete(key);
      }
    }
  }

  return getUserStorageUsage.withLock(
    { userId: scope.userId, tenantId: scope.tenantId },
    operation,
  );
}

function formatBytes(bytes: number): string {
  if (bytes >= megabyte) {
    const megabytes = bytes / megabyte;
    if (Number.isInteger(megabytes)) {
      return `${megabytes}MB`;
    }
    return `${megabytes.toFixed(2)}MB (${bytes} bytes)`;
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
 * Rejects byte counts that cannot be charged. Usage sums only rows with `bytes > 0`,
 * so persisting a negative or non-numeric count would create a row that is never
 * counted against anyone — silently uncapped storage rather than a visible failure.
 */
function assertChargeableBytes(bytes: number | null | undefined, label: string): void {
  if (bytes == null) {
    return;
  }
  const value = Number(bytes);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`Refusing to persist ${label} with an uncountable byte size: ${String(bytes)}`);
  }
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

  /* A stripped request object structurally satisfies the rest of this shape, and
   * resolving one would mint a scope with no tenant and no cap — re-creating both the
   * parallel-ledger and quota-disabled failures. Requiring the config makes that a
   * loud failure at the boundary instead of a silent one at the ledger. */
  if (req.config == null) {
    throw new Error(
      'Cannot resolve file storage scope without request config; pass the request that carries it, or the scope already resolved from it',
    );
  }

  const resolvedTenantId = req.tenantId ?? req.user?.tenantId;
  const mergedFileConfig = mergeFileConfig(req.config?.fileConfig);
  const configuredStorageLimit = req.config?.fileConfig?.storageLimit;
  const scope = {
    userId,
    tenantId: resolvedTenantId === '' ? undefined : resolvedTenantId,
    storageLimit:
      mergedFileConfig.storageLimit ??
      (configuredStorageLimit === undefined ? undefined : configuredStorageLimit * megabyte),
  } as StorageScope;

  scopesByRequest.set(req, scope);
  return scope;
}

export type StorageReplacementIdentity =
  | { kind: 'file'; fileId: string }
  | { kind: 'skill'; skillId: string; relativePath: string };

export type GetUserStorageUsage = {
  (params: { userId: string; tenantId?: string | null }): Promise<number>;
  withLock?: <T>(
    params: { userId: string; tenantId?: string | null },
    operation: (assertHeld: () => Promise<void>) => Promise<T>,
  ) => Promise<T>;
  getReplacementBytes?: (
    params: { userId: string; tenantId?: string | null } & StorageReplacementIdentity,
  ) => Promise<number | null>;
};

function idsMatch(
  left?: { toString(): string } | string | null,
  right?: { toString(): string } | string | null,
): boolean {
  return left != null && right != null && left.toString() === right.toString();
}

function tenantsMatch(left?: string | null, right?: string | null): boolean {
  const normalizeTenant = (tenant?: string | null) => (tenant ? tenant : null);
  return normalizeTenant(left) === normalizeTenant(right);
}

/**
 * Soft gate: blocks writes once observed usage reaches the cap. Concurrent requests
 * can each pass before either has committed its row, so the cap is approximate under
 * parallel uploads by one user — bounded by their in-flight request count.
 */
async function reserveWithinLimit(
  scope: StorageScope,
  getUserStorageUsage: GetUserStorageUsage,
  charge: number,
): Promise<void> {
  if (scope.storageLimit === undefined) {
    return;
  }

  const params = {
    userId: scope.userId,
    tenantId: scope.tenantId,
  };

  /* Re-read while holding the cross-process lock. A request-local cached total can
   * become stale after a different request commits between this request's writes. */
  scope.currentUsage = await getUserStorageUsage(params);

  const currentUsage = scope.currentUsage;
  if (currentUsage === undefined) {
    throw new Error('Storage usage was not initialized');
  }
  if (Math.max(0, currentUsage + charge) > scope.storageLimit) {
    throw new FileStorageLimitError(scope.storageLimit, currentUsage);
  }

  /* Do not expose a replacement's negative delta until its write commits: another
   * concurrent addition must not spend space that has not actually been freed yet. */
  scope.currentUsage += Math.max(charge, 0);
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
   * Size of the row this write replaces, when replacing one. The ledger total already
   * contains its old bytes, so only the difference is charged.
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
  ownerField: OwnerField,
  replacementKey: string | undefined,
  replacementIdentity: StorageReplacementIdentity | undefined,
  onRollbackError: (error: unknown) => void,
): Promise<TResult> {
  try {
    assertChargeableBytes(row.bytes, `${ownerField === 'author' ? 'skill file' : 'file'} row`);
  } catch (error) {
    await runRollback(rollback, onRollbackError);
    throw error;
  }

  /* Owner and tenant both come from the scope. A row written to a different owner's
   * ledger than the one just checked would leave that owner's usage unenforced, so the
   * queried ledger and the written ledger are made the same by construction. */
  const scopedRow: TRow = { ...row, [ownerField]: scope.userId, tenantId: scope.tenantId };
  const bytes = normalizeBytes(scopedRow.bytes);
  const suppliedReplaced = normalizeBytes(
    replacementKey ? (scope.replacementBytes?.get(replacementKey) ?? replacedBytes) : replacedBytes,
  );

  /* The charge is reserved as part of the check, so a batch running under `Promise.all`
   * cannot have both writes observe the same headroom and both take it. The reservation
   * is released if the write fails, so a failed row does not consume the cap for the
   * rest of the request. */
  let charge = bytes - suppliedReplaced;
  let enteredQuotaLock = false;
  try {
    return await withStorageQuotaLock(scope, getUserStorageUsage, async (assertHeld) => {
      enteredQuotaLock = true;
      try {
        if (replacementIdentity && getUserStorageUsage.getReplacementBytes) {
          const currentReplacedBytes = await getUserStorageUsage.getReplacementBytes({
            userId: scope.userId,
            tenantId: scope.tenantId,
            ...replacementIdentity,
          });
          charge = bytes - normalizeBytes(currentReplacedBytes);
        }
        await reserveWithinLimit(scope, getUserStorageUsage, charge);
        await assertHeld();
      } catch (error) {
        await runRollback(rollback, onRollbackError);
        throw error;
      }
      try {
        const result = await write(scopedRow);
        if (result == null) {
          throw new Error('Quota-bearing persistence callback completed without committing a row');
        }
        if (scope.storageLimit !== undefined && charge < 0) {
          scope.currentUsage = Math.max(0, (scope.currentUsage as number) + charge);
        }
        if (replacementKey) {
          scope.replacementBytes ??= new Map();
          scope.replacementBytes.set(replacementKey, bytes);
        }
        return result;
      } catch (error) {
        if (scope.storageLimit !== undefined && charge > 0) {
          scope.currentUsage = (scope.currentUsage as number) - charge;
        }
        throw error;
      }
    });
  } catch (error) {
    if (!enteredQuotaLock) {
      await runRollback(rollback, onRollbackError);
    }
    throw error;
  }
}

async function serializeReplacement<TResult>(
  scope: StorageScope,
  replacementKey: string | undefined,
  operation: () => Promise<TResult>,
): Promise<TResult> {
  if (!replacementKey) {
    return operation();
  }

  scope.replacementLocks ??= new Map();
  const previous = scope.replacementLocks.get(replacementKey) ?? Promise.resolve();
  let release = () => {};
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  scope.replacementLocks.set(replacementKey, current);
  await previous;

  try {
    return await operation();
  } finally {
    release();
    if (scope.replacementLocks.get(replacementKey) === current) {
      scope.replacementLocks.delete(replacementKey);
    }
  }
}

export type FileRow = LedgerRow & {
  file_id?: string;
  user?: string;
};

export type SkillFileRow = LedgerRow & {
  skillId?: { toString(): string } | string;
  relativePath?: string;
  author?: { toString(): string } | string;
};

/**
 * Persists a `File` row under this request's storage scope.
 *
 * Re-uploading over a file is charged by the supplied replacement delta rather than
 * by adding the new size to the unexcluded ledger total.
 */
export function persistFileWithQuota<TRow extends FileRow, TResult>(
  params: PersistParams<TRow, TResult> & {
    replacing?: { file_id?: string; user?: unknown; tenantId?: string | null } | null;
  },
  onRollbackError: (error: unknown) => void,
): Promise<TResult> {
  const { replacing, ...rest } = params;
  const replacedByRequester =
    replacing != null &&
    typeof replacing.file_id === 'string' &&
    replacing.file_id.length > 0 &&
    typeof rest.row.file_id === 'string' &&
    rest.row.file_id.length > 0 &&
    replacing.file_id === rest.row.file_id &&
    idsMatch(replacing.user as string, params.scope.userId) &&
    tenantsMatch(replacing.tenantId, params.scope.tenantId);
  const replacementKey =
    replacedByRequester && rest.replacedBytes != null && rest.row.file_id
      ? `file:${rest.row.file_id}`
      : undefined;
  return serializeReplacement(params.scope, replacementKey, () =>
    persistWithQuota(
      { ...rest, replacedBytes: replacedByRequester ? rest.replacedBytes : 0 },
      'user',
      replacementKey,
      replacementKey && rest.row.file_id ? { kind: 'file', fileId: rest.row.file_id } : undefined,
      onRollbackError,
    ),
  );
}

/**
 * Persists a `SkillFile` row under this request's storage scope.
 *
 * Skill files are charged to their author, not to everyone who runs the skill, and a
 * file replacing one the requester already authored is charged by its replacement
 * delta. A row authored by somebody else stays on that author's ledger and is not
 * discounted.
 */
export function persistSkillFileWithQuota<TRow extends SkillFileRow, TResult>(
  params: PersistParams<TRow, TResult> & {
    replacing?: {
      skillId?: { toString(): string } | string;
      relativePath?: string;
      author?: unknown;
      tenantId?: string | null;
    } | null;
  },
  onRollbackError: (error: unknown) => void,
): Promise<TResult> {
  const { replacing, ...rest } = params;
  const replacingSkillId = replacing?.skillId?.toString();
  const rowSkillId = rest.row.skillId?.toString();
  const replacedByRequester =
    replacing != null &&
    typeof replacingSkillId === 'string' &&
    replacingSkillId.length > 0 &&
    typeof rowSkillId === 'string' &&
    rowSkillId.length > 0 &&
    typeof replacing.relativePath === 'string' &&
    replacing.relativePath.length > 0 &&
    typeof rest.row.relativePath === 'string' &&
    rest.row.relativePath.length > 0 &&
    replacingSkillId === rowSkillId &&
    replacing.relativePath === rest.row.relativePath &&
    idsMatch(replacing.author as string, params.scope.userId) &&
    tenantsMatch(replacing.tenantId, params.scope.tenantId);
  const replacementKey =
    replacedByRequester && rest.replacedBytes != null && rest.row.skillId && rest.row.relativePath
      ? `skill:${rest.row.skillId.toString()}:${rest.row.relativePath}`
      : undefined;

  return serializeReplacement(params.scope, replacementKey, () =>
    persistWithQuota(
      {
        ...rest,
        /* Only a row already on this ledger may be netted off. Overwriting a file another
         * author owns leaves their bytes on their ledger, so subtracting them here would
         * understate — and could drive negative — the requester's own usage. */
        replacedBytes: replacedByRequester ? rest.replacedBytes : 0,
      },
      'author',
      replacementKey,
      replacementKey && rowSkillId && rest.row.relativePath
        ? { kind: 'skill', skillId: rowSkillId, relativePath: rest.row.relativePath }
        : undefined,
      onRollbackError,
    ),
  );
}
