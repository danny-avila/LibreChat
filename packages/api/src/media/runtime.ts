import { randomUUID } from 'node:crypto';
import { FileSources, resolveMediaConfig } from 'librechat-data-provider';
import type {
  MediaMethods,
  MediaNativeMethods,
  MediaPresetMethods,
  MediaTitleMethods,
  MediaRecoveryMethods,
  AppConfig,
  IUser,
  MediaOwnerScope,
} from '@librechat/data-schemas';
import type { MediaConfig } from 'librechat-data-provider';
import type { Request, Router } from 'express';
import type {
  MediaAccounting,
  MediaContext,
  MediaServices,
  MediaServiceDependencies,
} from './service';
import type { MediaChatSource, NativeMediaFactory, NativeMediaUsageSink } from './native';
import type { BalanceCreditReservationDeps } from '~/middleware/checkBalance';
import type { MediaVertexCredentialProvider } from './vertexAuth';
import type { ModerationCheck } from '../middleware/moderation';
import type { MediaDerivativeProcessor } from './derivatives';
import type { MediaLifecycleObserver } from './telemetry';
import type { MediaRecoveryServices } from './recovery';
import type { MediaAdmissionPolicy } from './admission';
import type { MediaProviderAdapter } from './provider';
import type { MediaEnvironment } from './credentials';
import type { RecordUsageDeps } from '~/agents/usage';
import type { MediaTransport } from './transport';
import type { MediaObjectStore } from './objects';
import type { MediaModelTracer } from './tracing';
import type { MediaUploadFactory } from './http';
import type { EndpointDbMethods } from '~/types';
import type { MediaWorker } from './worker';
import { createMediaTitleGenerator, createMediaTitleModelResolver } from './title';
import { createMediaServices, mediaTemporaryRetentionMs } from './service';
import { createMediaStorage, resolveMediaStorageSource } from './storage';
import { createMediaCredentialResolver } from './credentials';
import { createRESTMediaAdapters } from './adapters/rest';
import { createMediaRecoveryServices } from './recovery';
import { createNativeMediaFactory } from './native';
import { createMediaContentRouter } from './stream';
import { resolveMediaPermissions } from './config';
import { ALLOWED_USER_FIELDS } from '~/utils/env';
import { createMediaStaging } from './staging';
import { createMediaWorker } from './worker';
import { MediaServiceError } from './errors';
import { createMediaRouter } from './http';

type MediaActor = NonNullable<MediaContext['user']>;
export interface MediaRuntimeDependencies {
  observer?: MediaLifecycleObserver;
  modelTracer?: MediaModelTracer;
  appConfig: AppConfig;
  repository: MediaMethods &
    MediaNativeMethods &
    MediaPresetMethods &
    Partial<MediaTitleMethods & MediaRecoveryMethods>;
  /** Enables LLM-generated thread titles; provider credentials and billing come from the host. */
  titles?: {
    db: EndpointDbMethods;
    usage?: RecordUsageDeps;
    admission?: Omit<BalanceCreditReservationDeps, 'balanceConfig'>;
  };
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
  admission?: MediaAdmissionPolicy;
  moderate?: ModerationCheck;
  upload: MediaUploadFactory;
  accounting: MediaAccounting;
  objectStores?: readonly MediaObjectStore[];
  derivatives?: MediaDerivativeProcessor;
  deferAssetDeletion?: MediaServiceDependencies['deferAssetDeletion'];
  deferAssetWriteDeletion?: MediaServiceDependencies['deferAssetWriteDeletion'];
  log(error: Error): void;
}

export interface MediaRuntime {
  router: Router;
  contentRouter: Router;
  services: MediaServices;
  recovery?: MediaRecoveryServices;
  worker: MediaWorker;
  nativeFactory(
    request: Request,
    source: MediaChatSource,
    onUsage?: NativeMediaUsageSink,
  ): Promise<NativeMediaFactory | undefined>;
}

export function createMediaRuntime(input: MediaRuntimeDependencies): MediaRuntime {
  const { repository } = input;
  const baseConfig = input.appConfig.media ?? resolveMediaConfig();
  const imageDirectory = input.appConfig.paths?.imageOutput;
  const uploadDirectory = input.appConfig.paths?.uploads;
  if (!imageDirectory || !uploadDirectory) {
    throw new Error('Media storage paths are unavailable.');
  }
  const storage = createMediaStorage({
    repository,
    imageDirectory,
    uploadDirectory,
    now: Date.now,
    stores: input.objectStores,
    derivatives: input.derivatives,
    imageOutputType: input.appConfig.imageOutputType,
    log: input.log,
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
  async function actorContext(
    actor: MediaActor,
    effectiveConfig?: AppConfig,
  ): Promise<MediaContext> {
    const [appConfig, role] = await Promise.all([
      effectiveConfig
        ? Promise.resolve(effectiveConfig)
        : input.getAppConfig({
            userId: actor.id,
            role: actor.role,
            tenantId: actor.tenantId,
            idOnTheSource: actor.idOnTheSource,
            failClosed: true,
          }),
      actor.role ? input.getRoleByName(actor.role) : Promise.resolve(null),
    ]);
    const configured = appConfig.media ?? resolveMediaConfig();
    const config = {
      ...configured,
      assets: {
        ...configured.assets,
        source: resolveMediaStorageSource({ config: configured, appConfig }) as NonNullable<
          MediaConfig['assets']['source']
        >,
      },
    };
    const store = input.objectStores?.find((entry) => entry.source === config.assets.source);
    return {
      scope: { ownerId: actor.id, tenantId: actor.tenantId ?? null },
      user: actor,
      appConfig,
      config,
      storageSources: [
        FileSources.local,
        ...(input.objectStores ?? []).map((store) => store.source),
      ],
      storageReady: (await store?.isAvailable?.()) ?? true,
      ...resolveMediaPermissions(role),
    };
  }
  const loadContext = async (scope: MediaOwnerScope) => {
    const actor = await input.getUserById(
      scope.ownerId,
      `${ALLOWED_USER_FIELDS.join(' ')} tenantId idOnTheSource`,
    );
    if (!actor || (actor.tenantId ?? null) !== scope.tenantId) {
      throw new MediaServiceError('forbidden', 403, 'The media owner is unavailable.');
    }
    return actorContext({ ...actor, id: scope.ownerId });
  };
  const withScope = <T>(scope: MediaOwnerScope, operation: () => Promise<T>) =>
    input.tenantContext.run({ tenantId: scope.tenantId ?? undefined }, operation);
  const titles =
    input.titles && repository.claimMediaThreadTitle
      ? createMediaTitleGenerator({
          repository: {
            replaceMediaThreadTitle: repository.replaceMediaThreadTitle,
            claimMediaThreadTitle: repository.claimMediaThreadTitle,
          },
          resolveModel: createMediaTitleModelResolver({ db: input.titles.db }),
          modelTracer: input.modelTracer,
          usage: input.titles.usage,
          admission: input.titles.admission,
          withScope,
          log: input.log,
        })
      : undefined;
  const deps = {
    observer: input.observer,
    modelTracer: input.modelTracer,
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
    deferAssetDeletion: input.deferAssetDeletion,
    deferAssetWriteDeletion: input.deferAssetWriteDeletion,
    async migrateNativeConsumers(scope: MediaOwnerScope, config: MediaConfig, threadId?: string) {
      await repository.migrateMediaNativeConsumers({
        scope,
        threadId,
        maxRetainers: config.limits.maxAssetRetainers,
        limit: config.limits.pageSize,
      });
    },
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
    moderate: input.moderate,
    asSystem: input.asSystem,
    withScope,
    now: Date.now,
    id: randomUUID,
    log: input.log,
  };
  const services = createMediaServices(deps);
  const recovery =
    repository.listMediaRecoveryJobs && repository.resolveMediaRecovery
      ? createMediaRecoveryServices(
          deps,
          {
            listMediaRecoveryJobs: repository.listMediaRecoveryJobs,
            resolveMediaRecovery: repository.resolveMediaRecovery,
            failMediaNativeRecording: repository.failMediaNativeRecording,
          },
          baseConfig,
        )
      : undefined;
  const worker = createMediaWorker(deps, services, baseConfig);
  const requestUser = (request: Request): IUser => {
    const user = (request as Request & { user?: IUser }).user;
    if (!user?.id) {
      throw new MediaServiceError('forbidden', 403, 'Authentication is required.');
    }
    return user;
  };
  const resolveContext = async (request: Request): Promise<MediaContext> => {
    const user = requestUser(request);
    return { ...(await actorContext(user)), user };
  };
  const router = createMediaRouter({
    admission: input.admission,
    services,
    storage,
    repository,
    upload: input.upload,
    staging,
    id: randomUUID,
    now: Date.now,
    log: input.log,
    resolveContext,
  });
  return {
    router,
    contentRouter: createMediaContentRouter({
      repository,
      storage,
      resolveScope: (request) => {
        const user = requestUser(request);
        return { ownerId: user.id, tenantId: user.tenantId ?? null };
      },
      log: input.log,
    }),
    services,
    worker,
    recovery,
    async nativeFactory(
      request: Request,
      source: MediaChatSource,
      onUsage?: NativeMediaUsageSink,
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
        currentContext ??= actorContext(user, (request as Request & { config?: AppConfig }).config);
        const context = await currentContext;
        return createNativeMediaFactory({ deps, repository, context, source, onUsage })(selection);
      };
    },
  };
}
