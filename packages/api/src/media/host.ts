import { trace } from '@opentelemetry/api';
import type {
  AppConfig,
  MediaMethods,
  MediaNativeMethods,
  MediaPresetMethods,
  MediaAccountingMethods,
  MediaTitleMethods,
  MediaRecoveryMethods,
  FileMethods,
} from '@librechat/data-schemas';
import type { AxiosInstance } from 'axios';
import type { BalanceCreditReservationDeps } from '~/middleware/checkBalance';
import type { MediaRuntime, MediaRuntimeDependencies } from './runtime';
import type { MediaAdmissionDependencies } from './admission';
import type { MediaStrategyResolver } from './objects';
import type { RecordUsageDeps } from '~/agents/usage';
import type { MediaEnvironment } from './credentials';
import type { MediaMetricEvent } from './telemetry';
import type { EndpointDbMethods } from '~/types';
import type { MediaUploadFactory } from './http';
import { createGoogleMediaAuthClient, createVertexMediaCredentialProvider } from './vertexAuth';
import { createFFmpegMediaProcessor, createMediaDerivativeProcessor } from './derivatives';
import { getFileRetentionMaxAttempts, getExpiredFileRetryDelay } from '~/files/sweep';
import { getBalanceConfig, getTransactionsConfig } from '~/app/config';
import { createModerationCheck } from '../middleware/moderation';
import { createMediaStrategyObjectStores } from './objects';
import { createMediaLifecycleObserver } from './telemetry';
import { createMediaAdmissionPolicy } from './admission';
import { resolveConfigSecret } from '~/admin/secrets';
import { createMediaAccounting } from './accounting';
import { createMediaModelTracer } from './tracing';
import { createMediaTransport } from './transport';
import { createMediaRuntime } from './runtime';
import { isEnabled } from '../utils/common';

/** Resolve the host's legacy/YAML policy before jobs freeze their accounting mode. */
export function resolveMediaHostConfig(
  appConfig: AppConfig,
  environment: MediaEnvironment,
): AppConfig {
  return {
    ...appConfig,
    balance: getBalanceConfig(appConfig, environment) ?? undefined,
    transactions: getTransactionsConfig(appConfig, environment),
  };
}

/** The slice of the host's model layer that Media Studio reads and writes. */
export interface MediaHostDatabase
  extends MediaMethods,
    MediaNativeMethods,
    MediaPresetMethods,
    MediaAccountingMethods,
    MediaTitleMethods,
    MediaRecoveryMethods,
    EndpointDbMethods {
  getUserById: MediaRuntimeDependencies['getUserById'];
  spendTokens: RecordUsageDeps['spendTokens'];
  spendStructuredTokens: RecordUsageDeps['spendStructuredTokens'];
  getMultiplier: NonNullable<RecordUsageDeps['pricing']>['getMultiplier'];
  getCacheMultiplier: NonNullable<RecordUsageDeps['pricing']>['getCacheMultiplier'];
  bulkInsertTransactions: NonNullable<RecordUsageDeps['bulkWriteOps']>['insertMany'];
  updateBalance: NonNullable<RecordUsageDeps['bulkWriteOps']>['updateBalance'];
  reserveBalance: BalanceCreditReservationDeps['reserveBalance'];
  renewBalanceReservation: BalanceCreditReservationDeps['renewBalanceReservation'];
  releaseBalanceReservation: BalanceCreditReservationDeps['releaseBalanceReservation'];
  incrementFileDeletionAttempts: FileMethods['incrementFileDeletionAttempts'];
  deferExpiredFile: FileMethods['deferExpiredFile'];
}

export interface MediaHostDependencies {
  mediaMetrics?: (event: MediaMetricEvent) => void;
  appConfig: AppConfig;
  db: MediaHostDatabase;
  getRoleByName: MediaRuntimeDependencies['getRoleByName'];
  getAppConfig: MediaRuntimeDependencies['getAppConfig'];
  tenantContext: MediaRuntimeDependencies['tenantContext'];
  asSystem: MediaRuntimeDependencies['asSystem'];
  environment: MediaEnvironment;
  http: AxiosInstance;
  upload: MediaUploadFactory;
  admission?: MediaAdmissionDependencies;
  getStorageStrategy?: MediaStrategyResolver;
  readFile(path: string, encoding: 'utf8'): Promise<string>;
  decrypt(value: string): Promise<string>;
  log(error: Error): void;
}

/** Assembles the runtime from host primitives so every entry point wires it the same way. */
export function createMediaRuntimeFromApp({
  mediaMetrics,
  appConfig,
  db,
  getRoleByName,
  getAppConfig,
  tenantContext,
  asSystem,
  environment,
  http,
  upload,
  admission,
  getStorageStrategy,
  readFile,
  decrypt,
  log,
}: MediaHostDependencies): MediaRuntime {
  return createMediaRuntime({
    observer: createMediaLifecycleObserver({
      tracer: trace.getTracer('librechat.telemetry'),
      metrics: mediaMetrics,
    }),
    modelTracer: createMediaModelTracer(),
    admission: admission ? createMediaAdmissionPolicy(admission, environment) : undefined,
    moderate: isEnabled(environment.OPENAI_MODERATION)
      ? createModerationCheck({ http, environment })
      : undefined,
    appConfig: resolveMediaHostConfig(appConfig, environment),
    repository: db,
    getUserById: db.getUserById,
    getRoleByName,
    getAppConfig: async (options) =>
      resolveMediaHostConfig(await getAppConfig(options), environment),
    tenantContext,
    asSystem,
    environment,
    vertexCredentials: createVertexMediaCredentialProvider({
      readFile,
      createAuth: createGoogleMediaAuthClient,
      now: Date.now,
      maxCacheEntries: appConfig.media?.catalog.maxCacheEntries,
    }),
    decrypt,
    resolveConfigSecret,
    transport: createMediaTransport({
      http,
    }),
    upload,
    objectStores: getStorageStrategy
      ? createMediaStrategyObjectStores(getStorageStrategy)
      : undefined,
    derivatives: createMediaDerivativeProcessor({
      imageOutputType: appConfig.imageOutputType,
      video: createFFmpegMediaProcessor(),
      log,
    }),
    accounting: createMediaAccounting({ repository: db, now: Date.now }),
    async deferAssetDeletion(scope, fileId) {
      const owner = { userId: scope.ownerId, tenantId: scope.tenantId };
      const startedAt = Date.now();
      const attempts = await db.incrementFileDeletionAttempts(fileId, owner);
      await db.deferExpiredFile(
        fileId,
        new Date(startedAt + getExpiredFileRetryDelay(attempts, getFileRetentionMaxAttempts())),
        owner,
      );
    },
    async deferAssetWriteDeletion(scope, writeId) {
      const startedAt = Date.now();
      const attempts = await db.incrementMediaAssetWriteDeletionAttempts({ scope, writeId });
      await db.deferMediaAssetWriteCleanup({
        scope,
        writeId,
        retryAt: new Date(
          startedAt + getExpiredFileRetryDelay(attempts, getFileRetentionMaxAttempts()),
        ).toISOString(),
      });
    },
    titles: {
      db: { getUserKey: db.getUserKey, getUserKeyValues: db.getUserKeyValues },
      admission: {
        reserveBalance: db.reserveBalance,
        renewBalanceReservation: db.renewBalanceReservation,
        releaseBalanceReservation: db.releaseBalanceReservation,
      },
      usage: {
        spendTokens: db.spendTokens,
        spendStructuredTokens: db.spendStructuredTokens,
        pricing: { getMultiplier: db.getMultiplier, getCacheMultiplier: db.getCacheMultiplier },
        bulkWriteOps: { insertMany: db.bulkInsertTransactions, updateBalance: db.updateBalance },
      },
    },
    log,
  });
}
