import logger from '~/config/winston';

interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  jitter?: boolean;
  retryableErrors?: string[];
  onRetry?: (error: Error, attempt: number, delayMs: number) => void;
}

const DEFAULT_OPTIONS: Required<Omit<RetryOptions, 'onRetry'>> = {
  maxAttempts: 5,
  baseDelayMs: 100,
  maxDelayMs: 10_000,
  jitter: true,
  retryableErrors: ['deadlock', 'lock timeout', 'write conflict', 'ECONNRESET'],
};

/**
 * Executes an async operation with exponential backoff + jitter retry
 * on transient errors (deadlocks, connection resets, lock timeouts).
 *
 * Designed for FerretDB/DocumentDB operations where concurrent index
 * creation or bulk writes can trigger PostgreSQL-level deadlocks.
 */
export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  label: string,
  options: RetryOptions = {},
): Promise<T | undefined> {
  const {
    maxAttempts = DEFAULT_OPTIONS.maxAttempts,
    baseDelayMs = DEFAULT_OPTIONS.baseDelayMs,
    maxDelayMs = DEFAULT_OPTIONS.maxDelayMs,
    jitter = DEFAULT_OPTIONS.jitter,
    retryableErrors = DEFAULT_OPTIONS.retryableErrors,
  } = options;

  if (maxAttempts < 1 || baseDelayMs < 0 || maxDelayMs < 0) {
    throw new Error(
      `[retryWithBackoff] Invalid options: maxAttempts must be >= 1, delays must be non-negative`,
    );
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (err: unknown) {
      const message = (err as Error)?.message ?? String(err);
      const isRetryable = retryableErrors.some((pattern) =>
        message.toLowerCase().includes(pattern.toLowerCase()),
      );

      if (!isRetryable || attempt === maxAttempts) {
        logger.error(
          `[retryWithBackoff] ${label} failed permanently after ${attempt} attempt(s): ${message}`,
        );
        throw err;
      }

      const exponentialDelay = baseDelayMs * Math.pow(2, attempt - 1);
      const jitterMs = jitter ? Math.random() * baseDelayMs : 0;
      const delayMs = Math.min(exponentialDelay + jitterMs, maxDelayMs);

      logger.warn(
        `[retryWithBackoff] ${label} attempt ${attempt}/${maxAttempts} failed (${message}), retrying in ${Math.round(delayMs)}ms`,
      );

      if (options.onRetry) {
        const normalizedError = err instanceof Error ? err : new Error(String(err));
        options.onRetry(normalizedError, attempt, delayMs);
      }

      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

interface IndexedModel {
  createIndexes: () => Promise<unknown>;
  init?: () => Promise<unknown>;
  modelName: string;
}

/** Amazon DocumentDB rejects a createIndex that arrives while another build on the
 * same collection is running (code 40333), where MongoDB would serialize it. */
const INDEX_BUILD_IN_PROGRESS = 'index build in progress';

/** Index builds wait out a peer replica's build of the same collection: the
 * delays sum to roughly half a minute before the caller learns of the failure. */
const INDEX_BUILD_RETRY_OPTIONS: Required<Omit<RetryOptions, 'onRetry'>> = {
  ...DEFAULT_OPTIONS,
  maxAttempts: 8,
  baseDelayMs: 500,
  retryableErrors: [...DEFAULT_OPTIONS.retryableErrors, INDEX_BUILD_IN_PROGRESS],
};

/**
 * Mongoose starts every compiled model's automatic index build in the background
 * as soon as its connection opens. An explicit build issued while that one is
 * still running is a second concurrent build of the same collection, which
 * single-build engines reject outright. Letting the automatic build settle first
 * keeps the two from overlapping; if it failed, the explicit build below is the
 * retry, so its outcome is deliberately ignored here.
 */
async function settleAutomaticIndexBuild(model: IndexedModel): Promise<void> {
  if (model.init == null) {
    return;
  }
  await model.init().catch(() => undefined);
}

/**
 * Creates all indexes for a Mongoose model with deadlock retry.
 * Use this instead of raw `model.createIndexes()` on FerretDB or DocumentDB.
 */
export async function createIndexesWithRetry(
  model: IndexedModel,
  options: RetryOptions = {},
): Promise<void> {
  await settleAutomaticIndexBuild(model);
  await retryWithBackoff(
    () => model.createIndexes() as Promise<unknown>,
    `createIndexes(${model.modelName})`,
    { ...INDEX_BUILD_RETRY_OPTIONS, ...options },
  );
}

/**
 * Initializes all collections and indexes for a set of models on a connection,
 * with per-model deadlock retry. Models are processed sequentially to minimize
 * contention on the DocumentDB catalog.
 */
export async function initializeOrgCollections(
  models: Record<string, IndexedModel & { createCollection: () => Promise<unknown> }>,
  options: RetryOptions = {},
): Promise<{ totalMs: number; perModel: Array<{ name: string; ms: number }> }> {
  const perModel: Array<{ name: string; ms: number }> = [];
  const t0 = Date.now();

  for (const model of Object.values(models)) {
    const modelStart = Date.now();
    await model.createCollection();
    await createIndexesWithRetry(model, options);
    perModel.push({ name: model.modelName, ms: Date.now() - modelStart });
  }

  return { totalMs: Date.now() - t0, perModel };
}
