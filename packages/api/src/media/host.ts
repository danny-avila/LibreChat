import type {
  AppConfig,
  MediaMethods,
  MediaNativeMethods,
  MediaPresetMethods,
  MediaAccountingMethods,
} from '@librechat/data-schemas';
import type { AxiosInstance } from 'axios';
import type { MediaRuntime, MediaRuntimeDependencies } from './runtime';
import type { MediaStrategyResolver } from './objects';
import type { RecordUsageDeps } from '~/agents/usage';
import type { MediaEnvironment } from './credentials';
import type { EndpointDbMethods } from '~/types';
import type { MediaUploadFactory } from './http';
import { createGoogleMediaAuthClient, createVertexMediaCredentialProvider } from './vertexAuth';
import { createFFmpegMediaProcessor, createMediaDerivativeProcessor } from './derivatives';
import { getBalanceConfig, getTransactionsConfig } from '~/app/config';
import { createMediaStrategyObjectStores } from './objects';
import { resolveConfigSecret } from '~/admin/secrets';
import { createMediaAccounting } from './accounting';
import { createMediaTransport } from './transport';
import { createMediaRuntime } from './runtime';

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
    EndpointDbMethods {
  getUserById: MediaRuntimeDependencies['getUserById'];
  spendTokens: RecordUsageDeps['spendTokens'];
  spendStructuredTokens: RecordUsageDeps['spendStructuredTokens'];
  getMultiplier: NonNullable<RecordUsageDeps['pricing']>['getMultiplier'];
  getCacheMultiplier: NonNullable<RecordUsageDeps['pricing']>['getCacheMultiplier'];
  bulkInsertTransactions: NonNullable<RecordUsageDeps['bulkWriteOps']>['insertMany'];
  updateBalance: NonNullable<RecordUsageDeps['bulkWriteOps']>['updateBalance'];
}

export interface MediaHostDependencies {
  appConfig: AppConfig;
  db: MediaHostDatabase;
  getRoleByName: MediaRuntimeDependencies['getRoleByName'];
  getAppConfig: MediaRuntimeDependencies['getAppConfig'];
  tenantContext: MediaRuntimeDependencies['tenantContext'];
  asSystem: MediaRuntimeDependencies['asSystem'];
  environment: MediaEnvironment;
  http: AxiosInstance;
  upload: MediaUploadFactory;
  getStorageStrategy?: MediaStrategyResolver;
  readFile(path: string, encoding: 'utf8'): Promise<string>;
  decrypt(value: string): Promise<string>;
  log(error: Error): void;
}

/** Assembles the runtime from host primitives so every entry point wires it the same way. */
export function createMediaRuntimeFromApp({
  appConfig,
  db,
  getRoleByName,
  getAppConfig,
  tenantContext,
  asSystem,
  environment,
  http,
  upload,
  getStorageStrategy,
  readFile,
  decrypt,
  log,
}: MediaHostDependencies): MediaRuntime {
  return createMediaRuntime({
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
      allowedAddresses: appConfig.endpoints?.allowedAddresses,
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
    titles: {
      db: { getUserKey: db.getUserKey, getUserKeyValues: db.getUserKeyValues },
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
