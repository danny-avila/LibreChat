import {
  deriveMediaThreadTitle,
  getTempChatRetentionHours,
  MediaPersistenceError,
} from '@librechat/data-schemas';
import {
  messageFilterPiiSchema,
  createMediaSubmissionSchema,
  createMediaImportSchema,
  createMediaPresetSchema,
  createMediaPresetUpdateSchema,
} from 'librechat-data-provider';
import type {
  MediaAsset,
  MediaThread,
  MediaTurn,
  MediaJob,
  MediaCatalog,
  MediaConfig,
  MediaIntegration,
  MediaPreset,
  MediaPresetUpdate,
  MediaPresetWrite,
  MediaSubmissionRequest,
  MediaImportRequest,
  MediaSubmissionReceipt,
  MediaImportReceipt,
  MediaThreadListRequest,
  MediaThreadUpdate,
  MediaURLUploadRequest,
  MediaURLUploadResponse,
} from 'librechat-data-provider';
import type {
  AppConfig,
  MediaPage,
  MediaMethods,
  MediaOwnerScope,
  MediaPresetMethods,
  MediaPublicationOptions,
  MediaStoredJob,
} from '@librechat/data-schemas';
import type {
  MediaConnection,
  MediaProviderAdapter,
  MediaProviderUsage,
  MediaProviderContext,
  MediaProviderPart,
  MediaProviderInput,
} from './provider';
import type { MediaHostedDependencies } from './hosted';
import type { MediaTitleGenerator } from './title';
import type { MediaContext } from './context';
import { createMediaCatalog, selectMediaRoute, validateMediaOffering } from './catalog';
import { importHostedMediaReference, verifyHostedMediaReference } from './hosted';
import { mediaInputByteLimit, prepareMediaInputContent } from './content';
import { assertModelBoundContent } from '../middleware/modelBoundContent';
import { isContentFilterError } from '../middleware/contentFilter';
import { UninspectableFileError } from '../protection/files';
import { MediaServiceError } from './errors';

export type { MediaContext } from './context';

export interface MediaAccounting {
  ensureReady?(): Promise<void>;
  scopes?: import('@librechat/data-schemas').MediaAccountingMethods['listMediaAccountingScopes'];
  reconcile?(scope: MediaOwnerScope, config: MediaConfig): Promise<number>;
  reserve(job: MediaStoredJob, integration: MediaIntegration, context: MediaContext): Promise<void>;
  settle(
    job: MediaStoredJob,
    usage: MediaProviderUsage | undefined,
    context: MediaContext,
  ): Promise<void>;
  release(job: MediaStoredJob, context: MediaContext): Promise<void>;
}

export interface MediaServiceDependencies extends MediaHostedDependencies {
  repository: MediaMethods & MediaPresetMethods;
  ensureReady?(): Promise<void>;
  /** Retention window for temporary creations recovered outside a request; derived from the host config. */
  temporaryRetentionMs?: number;
  reconcileNative?(scope: MediaOwnerScope, config: MediaConfig): Promise<void>;
  adapters: readonly MediaProviderAdapter[];
  resolveConnection(input: {
    scope: MediaOwnerScope;
    integration: MediaIntegration;
    appConfig: AppConfig;
    minValidityMs: number;
  }): Promise<MediaConnection>;
  describeUserKey?(input: {
    integration: MediaIntegration;
    appConfig: AppConfig;
  }): import('librechat-data-provider').MediaUserKey | undefined;
  loadContext(scope: MediaOwnerScope): Promise<MediaContext>;
  withScope<T>(scope: MediaOwnerScope, operation: () => Promise<T>): Promise<T>;
  asSystem<T>(operation: () => Promise<T>): Promise<T>;
  accounting: MediaAccounting;
  /** Names new threads in the background after the submission receipt is returned. */
  titles?: MediaTitleGenerator;
  log(error: Error): void;
}

export function assertMediaAccess(context: MediaContext, create = false): void {
  if (!context.canUse || (create && !context.canCreate)) {
    throw new MediaServiceError('forbidden', 403, 'Media access is not permitted.');
  }
  if (create && !context.config.enabled) {
    throw new MediaServiceError('disabled', 403, 'Media generation is disabled.');
  }
}

const HOUR_MS = 3_600_000;
/** Temporary creations share the chat retention policy so one setting governs both surfaces. */
export function mediaTemporaryRetentionMs(interfaceConfig: AppConfig['interfaceConfig']): number {
  return getTempChatRetentionHours(interfaceConfig) * HOUR_MS;
}
function publicationOptions(context: MediaContext): MediaPublicationOptions {
  return {
    maxRetainers: context.config.limits.maxAssetRetainers,
    maxTitleChars: context.config.limits.maxTitleChars,
    temporaryRetentionMs: mediaTemporaryRetentionMs(context.appConfig.interfaceConfig),
  };
}
function presetError(error: unknown): never {
  if (error instanceof MediaPersistenceError && error.code === 'capacity') {
    throw new MediaServiceError('quota_exceeded', 429, 'The preset limit has been reached.');
  }
  throw error;
}

export interface PreparedMedia {
  integration: MediaIntegration;
  connection: MediaConnection;
  inputs: MediaProviderInput[];
  providerTag?: string;
  continuation?: MediaProviderContext['continuation'];
}
export interface MediaServices {
  prepare(
    request: MediaSubmissionRequest,
    context: MediaContext,
    requireCatalogVersion: boolean,
    signal?: AbortSignal,
  ): Promise<PreparedMedia>;
  commands: {
    uploadURL(input: MediaURLUploadRequest, context: MediaContext): Promise<MediaURLUploadResponse>;
    submit(input: MediaSubmissionRequest, context: MediaContext): Promise<MediaSubmissionReceipt>;
    import(input: MediaImportRequest, context: MediaContext): Promise<MediaImportReceipt>;
    retry(
      jobId: string,
      clientRequestId: string,
      context: MediaContext,
    ): Promise<MediaSubmissionReceipt>;
    cancel(jobId: string, context: MediaContext): Promise<MediaJob | null>;
    updateThread(
      threadId: string,
      update: MediaThreadUpdate,
      context: MediaContext,
    ): Promise<MediaThread>;
    retire(
      threadId: string,
      context: MediaContext,
    ): Promise<{ threadId: string; phase: 'retiring' }>;
  };
  queries: {
    catalog(context: MediaContext): Promise<MediaCatalog>;
    threads(query: MediaThreadListRequest, context: MediaContext): Promise<MediaPage<MediaThread>>;
    thread(
      threadId: string,
      context: MediaContext,
    ): Promise<{ thread: MediaThread; turns: MediaPage<MediaTurn> }>;
    turns(
      threadId: string,
      cursor: string | undefined,
      limit: number | undefined,
      context: MediaContext,
    ): Promise<MediaPage<MediaTurn>>;
  };
  presets: {
    list(context: MediaContext): Promise<{ items: MediaPreset[] }>;
    create(presetId: string, input: MediaPresetWrite, context: MediaContext): Promise<MediaPreset>;
    update(
      presetId: string,
      update: MediaPresetUpdate,
      context: MediaContext,
    ): Promise<MediaPreset>;
    remove(presetId: string, context: MediaContext): Promise<{ presetId: string }>;
  };
}

export function createMediaServices(deps: MediaServiceDependencies): MediaServices {
  const catalog = createMediaCatalog({
    transport: deps.transport,
    adapters: deps.adapters,
    now: deps.now,
  });
  const resolve = (context: MediaContext, integration: MediaIntegration) =>
    deps.resolveConnection({
      scope: context.scope,
      integration,
      appConfig: context.appConfig,
      minValidityMs: context.config.credentials.minValidityAtDispatchMs,
    });
  const snapshot = (context: MediaContext) =>
    catalog.read(
      context.config,
      (integration) => resolve(context, integration),
      `${context.scope.tenantId ?? ''}:${context.scope.ownerId}`,
      (integration) => deps.describeUserKey?.({ integration, appConfig: context.appConfig }),
    );

  async function prepare(
    request: MediaSubmissionRequest,
    context: MediaContext,
    requireCatalogVersion: boolean,
    signal?: AbortSignal,
  ) {
    assertMediaAccess(context, true);
    const integration = context.config.integrations.find(
      (entry) => entry.id === request.selection.connectionId,
    );
    if (integration?.enabled === false) {
      throw new MediaServiceError('forbidden', 403, 'This media provider is disabled.');
    }
    if ((context.config.assets.source ?? context.appConfig.fileStrategy) !== 'local') {
      throw new MediaServiceError(
        'unsupported',
        422,
        'This media storage adapter is not available.',
      );
    }
    const current = await snapshot(context);
    if (requireCatalogVersion && current.catalog.version !== request.selection.catalogVersion) {
      throw new MediaServiceError('stale_catalog', 409, 'The media model catalog changed.');
    }
    const modelOffering = current.resolved.get(
      `${request.selection.connectionId}:${request.selection.modelId}`,
    );
    if (!modelOffering || !integration) {
      throw new MediaServiceError('unsupported', 422, 'The media model is unavailable.');
    }
    const selected = selectMediaRoute(modelOffering, request.selection.providerTag);
    validateMediaOffering(request, selected.offering, context.config.limits);
    const connection = await resolve(context, integration);
    const assets: MediaAsset[] = [];
    const inputs = await Promise.all(
      request.inputs.map(async (input) => {
        const { asset, data } = await deps.storage.read(
          context.scope,
          input.file_id,
          mediaInputByteLimit(input.role, context.config),
        );
        const content = await prepareMediaInputContent(
          input.role,
          asset.type,
          data,
          context.config,
        );
        const sourceURL = input.sourceURL
          ? await verifyHostedMediaReference(
              { url: input.sourceURL, role: input.role === 'audio' ? 'audio' : 'video' },
              data,
              context,
              deps.transport,
              signal,
            )
          : undefined;
        assets.push(asset);
        return { ...input, ...content, ...(sourceURL ? { sourceURL } : {}) };
      }),
    );
    let continuation: MediaProviderContext['continuation'];
    if (connection.api === 'google.generateContent' && request.threadId && request.parentTurnId) {
      const parent = await deps.repository.getMediaParentContext(
        context.scope,
        request.threadId,
        request.parentTurnId,
      );
      if (
        parent &&
        parent.execution.modelId === request.selection.modelId &&
        parent.execution.bindingRevision === connection.binding &&
        parent.provider.recovery?.parts
      ) {
        const parts: MediaProviderPart[] = [];
        for (const part of parent.provider.recovery.parts) {
          if (part.kind === 'text') {
            parts.push(part);
            continue;
          }
          if (part.kind !== 'image' || !part.fileId) {
            throw new MediaServiceError(
              'not_ready',
              409,
              'The selected native continuation is incomplete.',
            );
          }
          const { asset, data } = await deps.storage.read(
            context.scope,
            part.fileId,
            context.config.transfers.maxImageBytes,
          );
          const content = await prepareMediaInputContent(
            'reference',
            asset.type,
            data,
            context.config,
          );
          parts.push({
            kind: 'image',
            ordinal: part.ordinal,
            ...content,
            thoughtSignature: part.thoughtSignature,
          });
        }
        const parentInputs = await Promise.all(
          parent.request.inputs.map(async (input) => {
            if (input.role === 'audio' || input.role === 'video') {
              throw new MediaServiceError(
                'unsupported',
                422,
                'Unsupported native continuation input.',
              );
            }
            const { asset, data } = await deps.storage.read(
              context.scope,
              input.file_id,
              context.config.transfers.maxImageBytes,
            );
            const content = await prepareMediaInputContent(
              input.role,
              asset.type,
              data,
              context.config,
            );
            assets.push(asset);
            return { ...input, ...content };
          }),
        );
        const imageParts = parts.filter((part) => part.kind === 'image');
        const inputCount = inputs.length + parentInputs.length + imageParts.length;
        const descriptors = parts.map((part) =>
          part.kind === 'text'
            ? part
            : {
                kind: part.kind,
                ordinal: part.ordinal,
                type: part.type,
                thoughtSignature: part.thoughtSignature,
              },
        );
        if (
          inputCount >
            Math.min(
              context.config.limits.maxInputs,
              selected.offering.capabilities.find(
                (capability) => capability.operation === request.operation,
              )?.inputs.max ?? 0,
            ) ||
          parts.length > context.config.limits.maxNativeParts ||
          Buffer.byteLength(JSON.stringify(descriptors), 'utf8') >
            context.config.limits.maxNativeRecordingBytes ||
          parent.request.prompt.length + request.prompt.length >
            context.config.limits.maxPromptChars
        ) {
          throw new MediaServiceError(
            'invalid_request',
            422,
            'Native continuation exceeds the configured context limit.',
          );
        }
        continuation = { prompt: parent.request.prompt, inputs: parentInputs, parts };
      }
    }
    try {
      assertModelBoundContent({
        filters: context.appConfig.filters,
        legacyPii: context.appConfig.messageFilter?.pii
          ? messageFilterPiiSchema.parse(context.appConfig.messageFilter.pii)
          : undefined,
        submittedMessages: [
          { role: 'user', content: request.prompt },
          ...(continuation ? [{ role: 'user', content: continuation.prompt }] : []),
        ],
        files: assets,
      });
    } catch (error) {
      if (isContentFilterError(error) || error instanceof UninspectableFileError) {
        throw new MediaServiceError('forbidden', 403, 'Media input was blocked by content policy.');
      }
      throw error;
    }
    return { integration, connection, inputs, providerTag: selected.providerTag, continuation };
  }

  const pageLimit = (context: MediaContext, requested?: number) =>
    Math.min(requested ?? context.config.limits.pageSize, context.config.limits.maxPageSize);

  return {
    prepare,
    commands: {
      async uploadURL(input, context) {
        assertMediaAccess(context, true);
        return importHostedMediaReference(input, context, deps);
      },
      async submit(
        input: MediaSubmissionRequest,
        context: MediaContext,
      ): Promise<MediaSubmissionReceipt> {
        assertMediaAccess(context, true);
        const request = createMediaSubmissionSchema(context.config.limits).parse(input);
        const replay = await deps.repository.getMediaSubmission(
          context.scope,
          request.clientRequestId,
        );
        const ready = replay ? undefined : await prepare(request, context, true);
        const existing = replay
          ? await deps.repository.getMediaJob(context.scope, replay.jobId)
          : undefined;
        const execution =
          existing?.execution ??
          (ready
            ? {
                connectionId: request.selection.connectionId,
                modelId: request.selection.modelId,
                api: ready.connection.api,
                catalogVersion: request.selection.catalogVersion,
                bindingRevision: ready.connection.binding,
                billing: ready.integration.billing,
                providerTag: ready.providerTag,
                ...(ready.integration.endpointRef.kind === 'direct'
                  ? {}
                  : { endpointRef: ready.integration.endpointRef }),
                accountingMode: mediaAccountingMode(context.appConfig),
              }
            : undefined);
        if (!execution) {
          throw new MediaServiceError('not_found', 404, 'Submission is unavailable.');
        }
        const staged = await deps.repository.stageMediaSubmission({
          scope: context.scope,
          request,
          execution,
          maxActiveJobs: context.config.queue.maxPendingPerUser,
          maxPendingTotal: context.config.queue.maxPendingTotal,
        });
        const receipt =
          (await deps.repository.publishMediaSubmission(
            context.scope,
            staged.jobId,
            publicationOptions(context),
          )) ?? staged;
        if (
          !replay &&
          !request.threadId &&
          !request.temporary &&
          receipt.phase === 'accepted' &&
          deps.titles
        ) {
          void deps
            .titles({
              context,
              threadId: receipt.threadId,
              prompt: request.prompt,
              operation: request.operation,
              currentTitle: deriveMediaThreadTitle(
                request.prompt,
                context.config.limits.maxTitleChars,
              ),
            })
            .catch((error: unknown) =>
              deps.log(error instanceof Error ? error : new Error(String(error))),
            );
        }
        return receipt;
      },
      async import(input: MediaImportRequest, context: MediaContext): Promise<MediaImportReceipt> {
        assertMediaAccess(context, true);
        const parsed = createMediaImportSchema(context.config.limits).parse(input);
        const replay = await deps.repository.getMediaImport(context.scope, parsed.clientRequestId);
        if (replay) {
          return deps.repository.stageMediaImport({
            scope: context.scope,
            request: parsed,
            identityRequest: parsed,
          });
        }
        const request = {
          ...parsed,
          inputs: await Promise.all(
            parsed.inputs.map(async (reference) => ({
              ...reference,
              file_id: (
                await deps.storage.capture(context.scope, reference.file_id, context.config)
              ).file_id,
            })),
          ),
        };
        const receipt = await deps.repository.stageMediaImport({
          scope: context.scope,
          request,
          identityRequest: parsed,
        });
        return (
          (await deps.repository.publishMediaImport(
            context.scope,
            receipt.turnId,
            publicationOptions(context),
          )) ?? receipt
        );
      },
      async retry(jobId: string, clientRequestId: string, context: MediaContext) {
        assertMediaAccess(context, true);
        const old = await deps.repository.getMediaJob(context.scope, jobId);
        if (!old) {
          throw new MediaServiceError('not_found', 404, 'The job is unavailable.');
        }
        const replay = await deps.repository.getMediaSubmission(context.scope, clientRequestId);
        if (!replay) {
          await prepare(old.request, context, false);
        }
        const receipt = await deps.repository.retryMediaJob({
          scope: context.scope,
          jobId,
          clientRequestId,
          maxActiveJobs: context.config.queue.maxPendingPerUser,
          maxPendingTotal: context.config.queue.maxPendingTotal,
        });
        return (
          (await deps.repository.publishMediaSubmission(
            context.scope,
            receipt.jobId,
            publicationOptions(context),
          )) ?? receipt
        );
      },
      async cancel(jobId: string, context: MediaContext) {
        assertMediaAccess(context);
        const job = await deps.repository.getMediaJob(context.scope, jobId);
        if (!job) {
          throw new MediaServiceError('not_found', 404, 'The job is unavailable.');
        }
        if (job.phase !== 'queued' && job.phase !== 'cancelled') {
          throw new MediaServiceError(
            'cancel_unsupported',
            409,
            'This provider does not support cancelling accepted work.',
          );
        }
        return deps.repository.cancelMediaJob(context.scope, jobId);
      },
      async updateThread(threadId: string, update: MediaThreadUpdate, context: MediaContext) {
        assertMediaAccess(context);
        if (update.title && update.title.length > context.config.limits.maxTitleChars) {
          throw new MediaServiceError(
            'invalid_request',
            422,
            'The title exceeds the configured limit.',
          );
        }
        const result = await deps.repository.updateMediaThread({
          scope: context.scope,
          threadId,
          ...update,
        });
        if (!result) {
          throw new MediaServiceError('version_conflict', 409, 'The thread changed.');
        }
        return result;
      },
      async retire(threadId: string, context: MediaContext) {
        assertMediaAccess(context);
        if (!(await deps.repository.retireMediaThread(context.scope, threadId))) {
          throw new MediaServiceError('not_found', 404, 'The thread is unavailable.');
        }
        return { threadId, phase: 'retiring' as const };
      },
    },
    queries: {
      async catalog(context: MediaContext): Promise<MediaCatalog> {
        assertMediaAccess(context);
        if (!context.config.enabled) {
          return {
            schemaVersion: 1,
            version: 'disabled',
            offerings: [],
            limits: context.config.limits,
            clientPollIntervalMs: context.config.polling.clientIntervalMs,
            clientCatchUpIntervalMs: context.config.polling.clientCatchUpIntervalMs,
          };
        }
        return (await snapshot(context)).catalog;
      },
      async threads(query: MediaThreadListRequest, context: MediaContext) {
        assertMediaAccess(context);
        return deps.repository.listMediaThreads({
          scope: context.scope,
          cursor: query.cursor,
          limit: pageLimit(context, query.limit),
          filter: query.filter,
          include: query.include,
        });
      },
      async thread(threadId: string, context: MediaContext) {
        assertMediaAccess(context);
        const [thread, turns] = await Promise.all([
          deps.repository.getMediaThread(context.scope, threadId),
          deps.repository.listMediaTurns({
            scope: context.scope,
            threadId,
            limit: pageLimit(context),
            jobsPerTurn: pageLimit(context),
          }),
        ]);
        if (!thread) {
          throw new MediaServiceError('not_found', 404, 'The thread is unavailable.');
        }
        return { thread, turns };
      },
      async turns(
        threadId: string,
        cursor: string | undefined,
        limit: number | undefined,
        context: MediaContext,
      ) {
        assertMediaAccess(context);
        return deps.repository.listMediaTurns({
          scope: context.scope,
          threadId,
          cursor,
          limit: pageLimit(context, limit),
          jobsPerTurn: pageLimit(context),
        });
      },
    },
    presets: {
      async list(context: MediaContext) {
        assertMediaAccess(context);
        return { items: await deps.repository.listMediaPresets(context.scope) };
      },
      async create(presetId: string, input: MediaPresetWrite, context: MediaContext) {
        assertMediaAccess(context, true);
        const write = createMediaPresetSchema(context.config.limits).parse(input);
        return deps.repository
          .createMediaPreset({
            scope: context.scope,
            presetId,
            write,
            maxPresets: context.config.limits.maxPresets,
          })
          .catch(presetError);
      },
      async update(presetId: string, input: MediaPresetUpdate, context: MediaContext) {
        assertMediaAccess(context, true);
        const update = createMediaPresetUpdateSchema(context.config.limits).parse(input);
        const preset = await deps.repository.updateMediaPreset({
          scope: context.scope,
          presetId,
          update,
        });
        if (!preset) {
          throw new MediaServiceError('not_found', 404, 'The preset is unavailable.');
        }
        return preset;
      },
      async remove(presetId: string, context: MediaContext) {
        assertMediaAccess(context, true);
        if (!(await deps.repository.deleteMediaPreset(context.scope, presetId))) {
          throw new MediaServiceError('not_found', 404, 'The preset is unavailable.');
        }
        return { presetId };
      },
    },
  };
}

export const mediaAccountingMode = (appConfig: AppConfig): 'balance' | 'transactions' | 'none' => {
  if (appConfig.balance?.enabled) return 'balance';
  return appConfig.transactions?.enabled === false ? 'none' : 'transactions';
};
