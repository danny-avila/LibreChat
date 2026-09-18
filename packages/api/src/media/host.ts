import type {
  AppConfig,
  MediaMethods,
  MediaNativeMethods,
  MediaPresetMethods,
  MediaAccountingMethods,
} from '@librechat/data-schemas';
import type { AxiosInstance } from 'axios';
import type { MediaRuntime, MediaRuntimeDependencies } from './runtime';
import type { RecordUsageDeps } from '~/agents/usage';
import type { MediaEnvironment } from './credentials';
import type { EndpointDbMethods } from '~/types';
import type { MediaUploadFactory } from './http';
import { createGoogleMediaAuthClient, createVertexMediaCredentialProvider } from './vertexAuth';
import { resolveConfigSecret } from '~/admin/secrets';
import { createMediaAccounting } from './accounting';
import { createMediaTransport } from './transport';
import { createMediaRuntime } from './runtime';

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
  readFile,
  decrypt,
  log,
}: MediaHostDependencies): MediaRuntime {
  return createMediaRuntime({
    appConfig,
    repository: db,
    getUserById: db.getUserById,
    getRoleByName,
    getAppConfig,
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
