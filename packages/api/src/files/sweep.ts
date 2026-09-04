import {
  FileSources,
  EModelEndpoint,
  checkOpenAIStorage,
  defaultAssistantsVersion,
} from 'librechat-data-provider';
import type { AppConfig } from '@librechat/data-schemas';

const DEFAULT_FILE_RETENTION_SWEEP_INTERVAL_MS = 60 * 60 * 1000;
const DEFAULT_FILE_RETENTION_MAX_ATTEMPTS = 10;
const MIN_FILE_RETENTION_RETRY_BASE_MS = 60 * 1000;
const FILE_RETENTION_RETRY_MAX_MS = 24 * 60 * 60 * 1000;

type ExpiredFile = {
  file_id: string;
  source?: string;
  user?: string | { toString?: () => string };
  tenantId?: string;
};

type SweepRequest = {
  baseUrl: string;
  originalUrl: string;
  path: string;
  method: string;
  headers: Record<string, unknown>;
  query: Record<string, unknown>;
  params: Record<string, unknown>;
  config?: AppConfig;
  body: {
    endpoint: string;
    version: string;
  };
  user: {
    id: string;
    tenantId?: string;
  };
};

type SweepLogger = {
  info: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string, error?: unknown) => void;
};

type VersionedEndpointConfig = {
  version?: unknown;
  assistants?: { version?: unknown } | boolean;
};

type SweepDependencies = {
  getExpiredFiles: (
    limit: number,
    options: { maxAttempts: number },
  ) => Promise<ExpiredFile[] | null | undefined>;
  processDeleteRequest: (params: {
    req: SweepRequest;
    files: ExpiredFile[];
  }) => Promise<{ deletedFileIds: string[]; failedFileIds: string[] }>;
  incrementFileDeletionAttempts: (file_id: string) => Promise<number>;
  deferExpiredFile: (file_id: string, deletionRetryAt: Date) => Promise<void>;
  logger: SweepLogger;
};

type StartSweepDependencies = {
  sweepExpiredFiles: (options?: ExpiredFileSweepOptions) => Promise<ExpiredFileSweepResult>;
  runAsSystem: <T>(fn: () => Promise<T>) => Promise<T>;
  logger: SweepLogger;
};

export type ExpiredFileSweepOptions = {
  appConfig?: AppConfig;
  limit?: number;
  loadAppConfig?: () => Promise<AppConfig | undefined>;
};

export type ExpiredFileSweepResult = {
  scanned: number;
  deleted: number;
  failed: number;
};

export function getFileRetentionSweepInterval(
  interval: string | undefined = process.env.FILE_RETENTION_SWEEP_INTERVAL_MS,
): number {
  if (interval == null || interval.trim() === '') {
    return DEFAULT_FILE_RETENTION_SWEEP_INTERVAL_MS;
  }

  const value = Number(interval);
  if (!Number.isFinite(value) || value < 0 || (value > 0 && value < 1)) {
    return DEFAULT_FILE_RETENTION_SWEEP_INTERVAL_MS;
  }
  return value;
}

/**
 * Consecutive failures after which the sweep stops retrying a file.
 *
 * The record is kept so the reference survives for reconciliation, and
 * raising this limit re-admits everything previously given up on — that is
 * the supported way to resume once the underlying storage failure is fixed.
 */
export function getFileRetentionMaxAttempts(
  maxAttempts: string | undefined = process.env.FILE_RETENTION_SWEEP_MAX_ATTEMPTS,
): number {
  if (maxAttempts == null || maxAttempts.trim() === '') {
    return DEFAULT_FILE_RETENTION_MAX_ATTEMPTS;
  }

  const value = Number(maxAttempts);
  if (!Number.isInteger(value) || value < 1) {
    return DEFAULT_FILE_RETENTION_MAX_ATTEMPTS;
  }
  return value;
}

/**
 * Backoff before the next attempt, doubling from one sweep interval up to a
 * day. `attempts` is the file's failure count including the one just
 * recorded, so the first retry lands on the following sweep.
 *
 * The base tracks the configured interval so the schedule stays meaningful
 * at any cadence — a fixed hour would be inert for the first three attempts
 * of a six-hour sweep, and would skip twelve passes of a five-minute one.
 * The floor keeps a pathologically short interval from spending the whole
 * give-up budget on a transient outage.
 */
export function getExpiredFileRetryDelay(attempts: number): number {
  const interval = getFileRetentionSweepInterval();
  const base = Math.max(
    interval > 0 ? interval : DEFAULT_FILE_RETENTION_SWEEP_INTERVAL_MS,
    MIN_FILE_RETENTION_RETRY_BASE_MS,
  );
  const exponent = Math.max(0, attempts - 1);
  return Math.min(base * 2 ** exponent, FILE_RETENTION_RETRY_MAX_MS);
}

export function getExpiredFileEndpoint(source?: string): string {
  return source === FileSources.azure ? EModelEndpoint.azureAssistants : EModelEndpoint.assistants;
}

export function hasExpiredFileEndpointConfig(
  appConfig: AppConfig | undefined,
  source?: string,
): boolean {
  if (source === FileSources.azure) {
    return Boolean(appConfig?.endpoints?.[EModelEndpoint.azureOpenAI]?.assistants);
  }

  return Boolean(appConfig?.endpoints?.[EModelEndpoint.assistants]);
}

export function getConfiguredExpiredFileAssistantVersion({
  appConfig,
  source,
  endpoint,
}: {
  appConfig?: AppConfig;
  source?: string;
  endpoint: string;
}): unknown {
  const endpoints = appConfig?.endpoints as
    | Record<string, VersionedEndpointConfig | undefined>
    | undefined;
  const endpointVersion = endpoints?.[endpoint]?.version;
  if (endpointVersion != null) {
    return endpointVersion;
  }

  if (source === FileSources.azure) {
    const azureAssistantsConfig = endpoints?.[EModelEndpoint.azureOpenAI]?.assistants;
    if (typeof azureAssistantsConfig === 'object' && azureAssistantsConfig?.version != null) {
      return azureAssistantsConfig.version;
    }
  }

  return undefined;
}

export function getExpiredFileAssistantVersion({
  appConfig,
  source,
  endpoint,
}: {
  appConfig?: AppConfig;
  source?: string;
  endpoint: string;
}): string {
  const configuredVersion = getConfiguredExpiredFileAssistantVersion({
    appConfig,
    source,
    endpoint,
  });
  const assistantVersions = defaultAssistantsVersion as Record<string, number | undefined>;
  const fallbackVersion = assistantVersions[endpoint] ?? defaultAssistantsVersion.assistants ?? 2;

  return String(configuredVersion ?? fallbackVersion).replace(/^v/, '');
}

export function createExpiredFileSweepRequest({
  appConfig,
  file,
  userId,
}: {
  appConfig?: AppConfig;
  file: ExpiredFile;
  userId: string;
}): SweepRequest {
  const source = file.source ?? FileSources.local;
  const endpoint = getExpiredFileEndpoint(source);
  const version = getExpiredFileAssistantVersion({ appConfig, source, endpoint });
  const baseUrl = `/api/assistants/v${version}`;

  return {
    baseUrl,
    originalUrl: `${baseUrl}/files`,
    path: '/files',
    method: 'DELETE',
    headers: {},
    query: {},
    params: {},
    config: appConfig,
    body: {
      endpoint,
      version,
    },
    user: {
      id: userId,
      tenantId: file.tenantId,
    },
  };
}

export async function resolveExpiredFileSweepConfig({
  appConfig,
  file,
  loadAppConfig,
}: {
  appConfig?: AppConfig;
  file: ExpiredFile;
  loadAppConfig?: () => Promise<AppConfig | undefined>;
}): Promise<AppConfig | undefined> {
  const source = file.source ?? FileSources.local;
  if (
    !checkOpenAIStorage(source) ||
    hasExpiredFileEndpointConfig(appConfig, source) ||
    typeof loadAppConfig !== 'function'
  ) {
    return appConfig;
  }

  return (await loadAppConfig()) ?? appConfig;
}

export async function sweepExpiredFiles(
  { appConfig, limit = 100, loadAppConfig }: ExpiredFileSweepOptions | undefined = {},
  {
    getExpiredFiles,
    processDeleteRequest,
    incrementFileDeletionAttempts,
    deferExpiredFile,
    logger,
  }: SweepDependencies,
): Promise<ExpiredFileSweepResult> {
  const maxAttempts = getFileRetentionMaxAttempts();
  const files = (await getExpiredFiles(limit, { maxAttempts })) ?? [];
  let resolvedAppConfig = appConfig;
  let deleted = 0;
  let failed = 0;

  /* Every failure has to be recorded, not just counted: an unrecorded one
   * leaves the file at the head of the next `expiredAt`-ordered batch, and
   * a file that can never be deleted then crowds out every file that
   * expired after it for the life of the deployment. */
  const recordFailure = async (file: ExpiredFile): Promise<void> => {
    failed++;
    let attempts: number;
    try {
      /* The attempt number comes from the increment rather than from the
       * snapshot this batch queried, so two nodes sweeping the same file
       * each get a distinct one and exactly one of them observes the cap
       * being reached. */
      attempts = await incrementFileDeletionAttempts(file.file_id);
      await deferExpiredFile(
        file.file_id,
        new Date(Date.now() + getExpiredFileRetryDelay(attempts)),
      );
    } catch (error) {
      logger.error(
        `[sweepExpiredFiles] Error recording failed deletion of expired file ${file.file_id}:`,
        error,
      );
      return;
    }

    if (attempts < maxAttempts) {
      return;
    }
    logger.error(
      `[sweepExpiredFiles] Giving up on expired file ${file.file_id} after ${attempts} failed deletions. Its backing storage was not removed; the record is kept so the reference survives for reconciliation. Raise FILE_RETENTION_SWEEP_MAX_ATTEMPTS to retry it.`,
    );
  };

  for (const file of files) {
    const userId = typeof file.user === 'string' ? file.user : file.user?.toString?.();
    if (!userId) {
      logger.warn(`[sweepExpiredFiles] Skipping expired file without user: ${file.file_id}`);
      await recordFailure(file);
      continue;
    }

    try {
      resolvedAppConfig = await resolveExpiredFileSweepConfig({
        appConfig: resolvedAppConfig,
        file,
        loadAppConfig,
      });
      const req = createExpiredFileSweepRequest({ appConfig: resolvedAppConfig, file, userId });
      const { deletedFileIds, failedFileIds } = await processDeleteRequest({ req, files: [file] });
      if (failedFileIds.includes(file.file_id)) {
        await recordFailure(file);
        continue;
      }

      if (deletedFileIds.includes(file.file_id)) {
        deleted++;
      } else {
        logger.error(
          `[sweepExpiredFiles] Delete request finished without resolving expired file ${file.file_id}`,
        );
        await recordFailure(file);
      }
    } catch (error) {
      logger.error(`[sweepExpiredFiles] Error deleting expired file ${file.file_id}:`, error);
      await recordFailure(file);
    }
  }

  if (deleted > 0 || failed > 0) {
    logger.info(
      `[sweepExpiredFiles] Processed ${files.length} expired files: ${deleted} deleted, ${failed} failed`,
    );
  }

  return { scanned: files.length, deleted, failed };
}

export function startExpiredFileSweep(
  options: ExpiredFileSweepOptions | undefined = {},
  { sweepExpiredFiles, runAsSystem, logger }: StartSweepDependencies,
): NodeJS.Timeout | null {
  const intervalMs = getFileRetentionSweepInterval();
  if (intervalMs === 0) {
    logger.info('[sweepExpiredFiles] Disabled by FILE_RETENTION_SWEEP_INTERVAL_MS=0');
    return null;
  }

  let isSweeping = false;
  const runSweep = async () => {
    if (isSweeping) {
      return;
    }

    isSweeping = true;
    try {
      await runAsSystem(() => sweepExpiredFiles(options));
    } catch (error) {
      logger.error('[sweepExpiredFiles] Background sweep failed:', error);
    } finally {
      isSweeping = false;
    }
  };

  runSweep();
  const interval = setInterval(runSweep, intervalMs);
  interval.unref?.();
  return interval;
}
