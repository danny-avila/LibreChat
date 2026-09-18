import { randomUUID } from 'node:crypto';
import { resolveMediaConfig } from 'librechat-data-provider';
import type {
  MediaMethods,
  MediaNativeMethods,
  MediaPresetMethods,
  AppConfig,
  IUser,
  MediaOwnerScope,
} from '@librechat/data-schemas';
import type { Request, Router } from 'express';
import type { MediaAccounting, MediaContext, MediaServices } from './service';
import type { MediaChatSource, NativeMediaFactory } from './native';
import type { MediaVertexCredentialProvider } from './vertexAuth';
import type { MediaProviderAdapter } from './provider';
import type { MediaEnvironment } from './credentials';
import type { RecordUsageDeps } from '~/agents/usage';
import type { MediaTransport } from './transport';
import type { MediaUploadFactory } from './http';
import type { EndpointDbMethods } from '~/types';
import type { MediaWorker } from './worker';
import { createMediaTitleGenerator, createMediaTitleModelResolver } from './title';
import { createMediaServices, mediaTemporaryRetentionMs } from './service';
import { createMediaCredentialResolver } from './credentials';
import { createRESTMediaAdapters } from './adapters/rest';
import { createLocalMediaStorage } from './storage';
import { createNativeMediaFactory } from './native';
import { resolveMediaPermissions } from './config';
import { createMediaStaging } from './staging';
import { createMediaWorker } from './worker';
import { MediaServiceError } from './errors';
import { createMediaRouter } from './http';

type MediaActor = { id: string; role?: string; tenantId?: string; idOnTheSource?: string | null };
export interface MediaRuntimeDependencies {
  appConfig: AppConfig;
  repository: MediaMethods & MediaNativeMethods & MediaPresetMethods;
  /** Enables LLM-generated thread titles; provider credentials and billing come from the host. */
  titles?: { db: EndpointDbMethods; usage?: RecordUsageDeps };
  getUserById(id: string, select: string): Promise<Omit<MediaActor, 'id'> | null>;
  getRoleByName(
    name: string,
  ): Promise<{ permissions?: { MEDIA?: { USE?: boolean; CREATE?: boolean } } } | null>;
  getAppConfig(options: {
    userId?: string;
    role?: string;
    tenantId?: string;
    idOnTheSource?: string | null;
    failClosed?: boolean;
  }): Promise<AppConfig>;
  tenantContext: { run<T>(scope: { tenantId?: string }, work: () => Promise<T>): Promise<T> };
  asSystem<T>(work: () => Promise<T>): Promise<T>;
  environment: MediaEnvironment;
  vertexCredentials?: MediaVertexCredentialProvider;
  decrypt(value: string): Promise<string>;
  resolveConfigSecret?(value: string): string | undefined;
  transport: MediaTransport;
  adapters?: readonly MediaProviderAdapter[];
  upload: MediaUploadFactory;
  accounting: MediaAccounting;
  log(error: Error): void;
}

export interface MediaRuntime {
  router: Router;
  services: MediaServices;
  worker: MediaWorker;
  nativeFactory(request: Request, source: MediaChatSource): Promise<NativeMediaFactory | undefined>;
}

export function createMediaRuntime(input: MediaRuntimeDependencies): MediaRuntime {
  const { repository } = input;
  const baseConfig = input.appConfig.media ?? resolveMediaConfig();
  const imageDirectory = input.appConfig.paths?.imageOutput;
  const uploadDirectory = input.appConfig.paths?.uploads;
  if (!imageDirectory || !uploadDirectory) {
    throw new Error('Media storage paths are unavailable.');
  }
  const storage = createLocalMediaStorage({
    repository,
    imageDirectory,
    uploadDirectory,
    now: Date.now,
  });
  const staging = createMediaStaging({
    directory: `${uploadDirectory}/media-staging`,
    id: randomUUID,
  });
  const adapters = input.adapters ?? createRESTMediaAdapters();
  const resolveConnection = createMediaCredentialResolver({
    repository,
    environment: input.environment,
    decrypt: input.decrypt,
    now: Date.now,
    vertexCredentials: input.vertexCredentials,
    adapters,
    resolveConfigSecret: input.resolveConfigSecret,
  });
  async function actorContext(actor: MediaActor): Promise<MediaContext> {
    const [appConfig, role] = await Promise.all([
      input.getAppConfig({
        userId: actor.id,
        role: actor.role,
        tenantId: actor.tenantId,
        idOnTheSource: actor.idOnTheSource,
        failClosed: true,
      }),
      actor.role ? input.getRoleByName(actor.role) : Promise.resolve(null),
    ]);
    const config = appConfig.media ?? resolveMediaConfig();
    return {
      scope: { ownerId: actor.id, tenantId: actor.tenantId ?? null },
      appConfig,
      config,
      ...resolveMediaPermissions(role),
    };
  }
  const loadContext = async (scope: MediaOwnerScope) => {
    const actor = await input.getUserById(scope.ownerId, 'role tenantId idOnTheSource');
    if (!actor || (actor.tenantId ?? null) !== scope.tenantId) {
      throw new MediaServiceError('forbidden', 403, 'The media owner is unavailable.');
    }
    return actorContext({ ...actor, id: scope.ownerId });
  };
  const withScope = <T>(scope: MediaOwnerScope, operation: () => Promise<T>) =>
    input.tenantContext.run({ tenantId: scope.tenantId ?? undefined }, operation);
  const titles = input.titles
    ? createMediaTitleGenerator({
        repository,
        resolveModel: createMediaTitleModelResolver({ db: input.titles.db }),
        usage: input.titles.usage,
        withScope,
        log: input.log,
      })
    : undefined;
  const deps = {
    repository,
    storage,
    resolveConnection,
    describeUserKey: resolveConnection.describe,
    loadContext,
    accounting: input.accounting,
    titles,
    temporaryRetentionMs: mediaTemporaryRetentionMs(input.appConfig.interfaceConfig),
    ensureReady: async () => {
      await Promise.all([
        repository.ensureMediaNativeIndexes(),
        repository.ensureMediaPresetIndexes(),
      ]);
    },
    sweepStaging: staging.sweep,
    reconcileNative: async (scope: MediaOwnerScope, config: typeof baseConfig) => {
      await repository.reconcileMediaNativeRecordings({
        scope,
        now: new Date().toISOString(),
        staleBefore: new Date(Date.now() - config.recovery.attentionAfterMs).toISOString(),
        limit: config.limits.pageSize,
      });
    },
    adapters,
    transport: input.transport,
    asSystem: input.asSystem,
    withScope,
    now: Date.now,
    id: randomUUID,
    log: input.log,
  };
  const services = createMediaServices(deps);
  const worker = createMediaWorker(deps, services, baseConfig);
  const router = createMediaRouter({
    services,
    storage,
    repository,
    upload: input.upload,
    staging,
    id: randomUUID,
    now: Date.now,
    log: input.log,
    resolveContext: async (request: Request) => {
      const user = (request as Request & { user?: IUser }).user;
      if (!user?.id) {
        throw new MediaServiceError('forbidden', 403, 'Authentication is required.');
      }
      return { ...(await actorContext(user)), user };
    },
  });
  return {
    router,
    services,
    worker,
    async nativeFactory(
      request: Request,
      source: MediaChatSource,
    ): Promise<NativeMediaFactory | undefined> {
      if (!baseConfig.enabled && !worker.available) {
        return undefined;
      }
      const user = (request as Request & { user?: MediaActor }).user;
      if (!user?.id) {
        throw new MediaServiceError('forbidden', 403, 'Authentication is required.');
      }
      let currentContext: Promise<MediaContext> | undefined;
      return async (selection) => {
        if (selection.provider.toLowerCase() !== 'google') {
          return undefined;
        }
        currentContext ??= actorContext(user);
        const context = await currentContext;
        return createNativeMediaFactory({ deps, repository, context, source })(selection);
      };
    },
  };
}
