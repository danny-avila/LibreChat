import { randomUUID } from 'node:crypto';
import { resolveMediaConfig } from 'librechat-data-provider';
import type {
  MediaMethods,
  MediaNativeMethods,
  AppConfig,
  MediaOwnerScope,
} from '@librechat/data-schemas';
import type { Request, Router } from 'express';
import type { MediaAccounting, MediaContext, MediaServices } from './service';
import type { MediaChatSource, NativeMediaFactory } from './native';
import type { MediaEnvironment } from './credentials';
import type { MediaTransport } from './transport';
import type { MediaUploadFactory } from './http';
import type { MediaWorker } from './worker';
import { createMediaCredentialResolver } from './credentials';
import { createRESTMediaAdapters } from './adapters/rest';
import { createLocalMediaStorage } from './storage';
import { createNativeMediaFactory } from './native';
import { createMediaServices } from './service';
import { createMediaWorker } from './worker';
import { MediaServiceError } from './errors';
import { createMediaRouter } from './http';

type MediaActor = { id: string; role?: string; tenantId?: string; idOnTheSource?: string | null };
export interface MediaRuntimeDependencies {
  appConfig: AppConfig;
  repository: MediaMethods & MediaNativeMethods;
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
  decrypt(value: string): Promise<string>;
  transport: MediaTransport;
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
  const storage = createLocalMediaStorage({ repository, imageDirectory, uploadDirectory });
  const resolveConnection = createMediaCredentialResolver({
    repository,
    environment: input.environment,
    decrypt: input.decrypt,
    now: Date.now,
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
      canUse: role?.permissions?.MEDIA?.USE === true,
      canCreate: role?.permissions?.MEDIA?.CREATE === true,
    };
  }
  const loadContext = async (scope: MediaOwnerScope) => {
    const actor = await input.getUserById(scope.ownerId, 'role tenantId idOnTheSource');
    if (!actor || (actor.tenantId ?? null) !== scope.tenantId) {
      throw new MediaServiceError('forbidden', 403, 'The media owner is unavailable.');
    }
    return actorContext({ ...actor, id: scope.ownerId });
  };
  const deps = {
    repository,
    storage,
    resolveConnection,
    loadContext,
    accounting: input.accounting,
    ensureReady: () => repository.ensureMediaNativeIndexes(),
    reconcileNative: async (scope: MediaOwnerScope, config: typeof baseConfig) => {
      await repository.reconcileMediaNativeRecordings({
        scope,
        now: new Date().toISOString(),
        staleBefore: new Date(Date.now() - config.recovery.attentionAfterMs).toISOString(),
        limit: config.limits.pageSize,
      });
    },
    adapters: createRESTMediaAdapters(),
    transport: input.transport,
    asSystem: input.asSystem,
    withScope: <T>(scope: MediaOwnerScope, operation: () => Promise<T>) =>
      input.tenantContext.run({ tenantId: scope.tenantId ?? undefined }, operation),
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
    tempDirectory: `${uploadDirectory}/media-staging`,
    id: randomUUID,
    resolveContext: async (request: Request) => {
      const user = (request as Request & { user?: MediaActor }).user;
      if (!user?.id) {
        throw new MediaServiceError('forbidden', 401, 'Authentication is required.');
      }
      return actorContext(user);
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
        throw new MediaServiceError('forbidden', 401, 'Authentication is required.');
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
