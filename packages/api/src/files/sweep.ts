import {
  FileSources,
  EModelEndpoint,
  checkOpenAIStorage,
  defaultAssistantsVersion,
} from 'librechat-data-provider';
import type { AppConfig } from '@librechat/data-schemas';

const DEFAULT_FILE_RETENTION_SWEEP_INTERVAL_MS = 60 * 60 * 1000;

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
  getExpiredFiles: (limit: number) => Promise<ExpiredFile[] | null | undefined>;
  processDeleteRequest: (params: {
    req: SweepRequest;
    files: ExpiredFile[];
  }) => Promise<{ deletedFileIds: string[]; failedFileIds: string[] }>;
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
  interval = process.env.FILE_RETENTION_SWEEP_INTERVAL_MS,
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

export function getExpiredFileEndpoint(source?: string): string {
  return source === FileSources.azure ? EModelEndpoint.azureAssistants : EModelEndpoint.assistants;
}

export function hasExpiredFileEndpointConfig(appConfig: AppConfig | undefined, source?: string) {
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
  { appConfig, limit = 100, loadAppConfig }: ExpiredFileSweepOptions = {},
  { getExpiredFiles, processDeleteRequest, logger }: SweepDependencies,
): Promise<ExpiredFileSweepResult> {
  const files = (await getExpiredFiles(limit)) ?? [];
  let resolvedAppConfig = appConfig;
  let deleted = 0;
  let failed = 0;

  for (const file of files) {
    const userId = typeof file.user === 'string' ? file.user : file.user?.toString?.();
    if (!userId) {
      logger.warn(`[sweepExpiredFiles] Skipping expired file without user: ${file.file_id}`);
      failed++;
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
        failed++;
        continue;
      }

      if (deletedFileIds.includes(file.file_id)) {
        deleted++;
      } else {
        failed++;
        logger.error(
          `[sweepExpiredFiles] Delete request finished without resolving expired file ${file.file_id}`,
        );
      }
    } catch (error) {
      failed++;
      logger.error(`[sweepExpiredFiles] Error deleting expired file ${file.file_id}:`, error);
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
  options: ExpiredFileSweepOptions = {},
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
