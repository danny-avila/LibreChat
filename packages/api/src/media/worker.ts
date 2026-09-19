import { Readable } from 'node:stream';
import { deriveMediaThreadTitle } from '@librechat/data-schemas';
import type {
  MediaJobObservation,
  MediaStoredJob,
  MediaProviderState,
} from '@librechat/data-schemas';
import type { MediaConfig, MediaErrorCode, MediaOutput } from 'librechat-data-provider';
import type { MediaProviderContext, MediaProviderPart, MediaProviderResult } from './provider';
import type { MediaServices, MediaServiceDependencies, MediaContext } from './service';
import { getMediaTerminalRecovery, resolveMediaJobIntegration } from './recovery';
import { assertMediaAccess, mediaAccountingMode } from './service';
import { MediaServiceError, MediaProviderError } from './errors';
import { observeMedia, mediaJobEvent } from './telemetry';
import { isMediaConnectionBinding } from './provider';
import { mediaContentExtension } from './content';
import { scopeMediaTransport } from './transport';

export interface MediaWorker {
  start(): Promise<void>;
  stop(): Promise<void>;
  runJob(job: MediaStoredJob): Promise<void>;
  readonly available: boolean;
}

export function createMediaWorker(
  deps: MediaServiceDependencies,
  services: MediaServices,
  baseConfig: MediaConfig,
): MediaWorker {
  let stopped = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let scanning: Promise<void> | undefined;
  let maintaining: Promise<void> | undefined;
  let starting: Promise<void> | undefined;
  let lifecycle = 0;
  let dueCursor: string | undefined;
  let cleanupCursor: string | undefined;
  let accountingCursor: string | undefined;
  let permitCursor: string | undefined;
  const active = new Map<string, Promise<void>>();
  const controllers = new Set<AbortController>();
  const adapters = new Map(deps.adapters.map((adapter) => [adapter.api, adapter]));
  const workerId = deps.id();

  async function execute(initial: MediaStoredJob): Promise<void> {
    let job = initial;
    const startedAt = deps.now();
    let phaseStartedAt = startedAt;
    let attemptFailed = false;
    observeMedia(deps.observer, {
      ...mediaJobEvent(job),
      kind: 'attempt',
      result: 'started',
      ...(job.phase === 'queued'
        ? { queueWaitMs: Math.max(0, startedAt - Date.parse(job.createdAt)) }
        : {}),
    });
    const controller = new AbortController();
    controllers.add(controller);
    let context: MediaContext | undefined;
    const recordSettlement = async (work: () => Promise<void>) => {
      const start = deps.now();
      try {
        await work();
        observeMedia(deps.observer, {
          ...mediaJobEvent(job),
          kind: 'settlement',
          result: 'completed',
          durationMs: deps.now() - start,
        });
      } catch (error) {
        observeMedia(deps.observer, {
          ...mediaJobEvent(job),
          kind: 'settlement',
          result: 'failed',
          durationMs: deps.now() - start,
        });
        throw error;
      }
    };
    const settle = (
      usage: Parameters<MediaServiceDependencies['accounting']['settle']>[1],
      currentContext: MediaContext,
    ) => recordSettlement(() => deps.accounting.settle(job, usage, currentContext));
    let serial = Promise.resolve();
    const leased = (operation: () => Promise<void>) => {
      const work = serial.then(operation);
      serial = work.catch(() => undefined);
      return work;
    };
    const fence = () => ({
      scope: { tenantId: job.tenantId, ownerId: job.ownerId },
      jobId: job.jobId,
      leaseToken: initial.leaseToken ?? '',
      expectedVersion: job.version,
    });
    const refresh = async () => {
      const current = await deps.repository.getMediaJob(fence().scope, job.jobId);
      if (
        !current ||
        current.leaseToken !== initial.leaseToken ||
        Date.parse(current.leaseUntil ?? '') <= deps.now()
      ) {
        controller.abort();
        throw new MediaServiceError('version_conflict', 409, 'The job lease changed.');
      }
      job = current;
    };
    const observe = (observation: MediaJobObservation) =>
      leased(async () => {
        await refresh();
        const changed = await deps.repository.recordMediaJobObservation({
          ...fence(),
          observation,
          now: new Date(deps.now()).toISOString(),
        });
        if (!changed) {
          await refresh();
          throw new MediaServiceError('version_conflict', 409, 'The job changed.');
        }
        const previousPhase = job.phase;
        job = changed;
        if (job.phase !== previousPhase) {
          observeMedia(deps.observer, {
            ...mediaJobEvent(job),
            kind: 'transition',
            result: 'completed',
            previousPhase,
            durationMs: deps.now() - phaseStartedAt,
          });
          phaseStartedAt = deps.now();
        }
      });
    const renewal = setInterval(() => {
      void leased(async () => {
        await refresh();
        const updated = await deps.repository.renewMediaJob({
          ...fence(),
          now: new Date(deps.now()).toISOString(),
          leaseMs: baseConfig.worker.leaseMs,
        });
        if (!updated) {
          controller.abort();
          return;
        }
        job = updated;
      }).catch(() => controller.abort());
    }, baseConfig.worker.renewEveryMs);
    renewal.unref();

    try {
      context = await deps.loadContext(fence().scope);
      controller.signal.throwIfAborted();
      const terminalRecovery = getMediaTerminalRecovery(job);
      if (terminalRecovery) {
        await observe({
          phase: 'reconciling',
          provider: {
            ...job.provider,
            certainty: 'terminal',
            recovery: {
              ...job.provider.recovery,
              terminalStatus: terminalRecovery.status,
              usage: terminalRecovery.usage,
            },
          },
        });
        await settle(terminalRecovery.usage, context);
        await observe({
          phase: terminalRecovery.status,
          provider: { ...job.provider, certainty: 'terminal' },
        });
        return;
      }
      const currentContext = context;
      const loadProvider = async () => {
        const configuredIntegration = currentContext.config.integrations.find(
          (entry) => entry.id === job.execution.connectionId,
        );
        if (job.phase === 'queued' && configuredIntegration?.enabled === false) {
          throw new MediaServiceError('forbidden', 403, 'This media provider is disabled.');
        }
        const integration = resolveMediaJobIntegration(job, currentContext.config);
        const adapter = adapters.get(job.execution.api);
        if (!integration || !adapter) {
          throw new MediaServiceError(
            'not_ready',
            409,
            'The original media connection is unavailable.',
          );
        }
        const connection = await deps.resolveConnection({
          scope: currentContext.scope,
          integration,
          appConfig: currentContext.appConfig,
          minValidityMs: currentContext.config.credentials.minValidityAtDispatchMs,
          user: currentContext.user,
        });
        if (!isMediaConnectionBinding(connection, job.execution.bindingRevision)) {
          throw new MediaServiceError(
            'credentials_required',
            409,
            'The original provider credential binding changed.',
          );
        }
        const providerContext: MediaProviderContext = {
          jobId: job.jobId,
          connection,
          config: currentContext.config,
          transport: scopeMediaTransport(deps.transport, connection.allowedAddresses),
          signal: controller.signal,
        };
        return { integration, adapter, providerContext };
      };
      let loadedProvider: ReturnType<typeof loadProvider> | undefined;
      const getProvider = () => (loadedProvider ??= loadProvider());
      const download = async (part: Extract<MediaProviderPart, { kind: 'image' | 'video' }>) => {
        const { adapter, providerContext } = await getProvider();
        return adapter.download(part, providerContext);
      };
      let result: MediaProviderResult;
      if (job.phase === 'queued') {
        const { integration, adapter, providerContext } = await getProvider();
        assertMediaAccess(context, true);
        if (job.execution.accountingMode !== mediaAccountingMode(context.appConfig)) {
          throw new MediaServiceError(
            'not_ready',
            409,
            'Media accounting policy changed before dispatch.',
          );
        }
        if (deps.now() - Date.parse(job.createdAt) > context.config.queue.maxQueueAgeMs) {
          await observe({
            phase: 'failed',
            provider: { certainty: 'unsubmitted' },
            error: { code: 'queue_expired' },
          });
          return;
        }
        const admitted = await deps.repository.acquireMediaPermits({
          scope: context.scope,
          jobId: job.jobId,
          permits: [
            { kind: 'deployment', capacity: context.config.execution.maxActiveTotal },
            {
              kind: 'integration',
              capacity: context.config.execution.maxActivePerIntegration,
              key: integration.id,
            },
            { kind: 'owner', capacity: context.config.execution.maxActivePerUser },
          ],
        });
        if (!admitted) {
          await observe({
            phase: 'queued',
            dueAt: new Date(deps.now() + context.config.worker.tickMs).toISOString(),
            releaseLease: true,
          });
          return;
        }
        const prepared = await services.prepare(job.request, context, false, controller.signal);
        controller.signal.throwIfAborted();
        if (prepared.providerTag !== job.execution.providerTag) {
          throw new MediaServiceError(
            'stale_catalog',
            409,
            'The selected provider endpoint changed.',
          );
        }
        providerContext.providerTag = job.execution.providerTag;
        providerContext.continuation = prepared.continuation;
        await deps.accounting.reserve(job, integration, context);
        controller.signal.throwIfAborted();
        if (deps.titles && !job.request.threadId && !job.request.temporary) {
          await deps.titles({
            context,
            jobId: job.jobId,
            threadId: job.threadId,
            prompt: job.request.prompt,
            operation: job.operation,
            currentTitle: deriveMediaThreadTitle(
              job.request.prompt,
              context.config.limits.maxTitleChars,
            ),
            signal: controller.signal,
          });
          controller.signal.throwIfAborted();
        }
        await leased(async () => {
          await refresh();
          const submitting = await deps.repository.beginMediaSubmission({
            ...fence(),
            now: new Date(deps.now()).toISOString(),
          });
          if (!submitting) {
            throw new MediaServiceError('version_conflict', 409, 'Submission admission changed.');
          }
          job = submitting;
          observeMedia(deps.observer, {
            ...mediaJobEvent(job),
            kind: 'transition',
            result: 'completed',
            previousPhase: 'queued',
            durationMs: deps.now() - phaseStartedAt,
          });
          phaseStartedAt = deps.now();
        });
        controller.signal.throwIfAborted();
        const submit = () => adapter.submit(job.request, prepared.inputs, providerContext);
        result = deps.modelTracer
          ? await deps.modelTracer.run(
              {
                context,
                jobId: job.jobId,
                threadId: job.threadId,
                kind: 'submission',
                provider: job.execution.api,
                model: job.execution.modelId,
              },
              submit,
              (result) => {
                const usage = result.status === 'running' ? undefined : result.usage;
                return usage
                  ? {
                      input_tokens: usage.inputTokens ?? 0,
                      output_tokens: usage.outputTokens ?? 0,
                      total_tokens: (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0),
                    }
                  : undefined;
              },
            )
          : await submit();
      } else if (
        job.provider.certainty === 'terminal' &&
        job.provider.recovery?.terminalStatus &&
        job.provider.recovery.terminalStatus !== 'completed'
      ) {
        result = {
          status: job.provider.recovery.terminalStatus,
          usage: job.provider.recovery.usage,
        };
      } else if (job.provider.certainty === 'terminal' && job.provider.recovery?.parts) {
        const parts: MediaProviderPart[] = [];
        for (const part of job.provider.recovery.parts) {
          if (part.kind === 'text') {
            parts.push(part);
            continue;
          }
          const outputId = `${job.jobId}:${part.ordinal}`;
          const asset = part.fileId
            ? await deps.repository.getMediaAsset(context.scope, part.fileId)
            : await deps.repository.getPublishedMediaAsset({
                scope: context.scope,
                outputKey: outputId,
                rendition: 'original',
              });
          if (asset || part.fileId) {
            if (asset) {
              part.fileId = asset.file_id;
            }
            if (!job.outputs.some((output) => output.outputId === outputId)) {
              const retained =
                asset &&
                (await deps.repository.retainMediaThreadAsset({
                  scope: context.scope,
                  threadId: job.threadId,
                  fileId: asset.file_id,
                  maxRetainers: context.config.limits.maxAssetRetainers,
                }));
              job.outputs.push(
                retained
                  ? { kind: part.kind, outputId, ordinal: part.ordinal, state: 'ready', asset }
                  : {
                      kind: part.kind,
                      outputId,
                      ordinal: part.ordinal,
                      state: 'expired',
                      error: { code: 'output_expired' },
                    },
              );
            }
            continue;
          }
          if (!part.url) {
            throw new MediaServiceError(
              'output_expired',
              409,
              'This direct output could not be recovered.',
            );
          }
          parts.push(part);
        }
        result = { status: 'completed', parts, usage: job.provider.recovery.usage };
      } else if (job.provider.operationId && adapters.get(job.execution.api)?.poll) {
        const { adapter, providerContext } = await getProvider();
        const poll = adapter.poll;
        if (!poll)
          throw new MediaServiceError('not_ready', 409, 'Provider polling is unavailable.');
        const cancellation = adapter.cancel;
        if (
          job.cancelRequestedAt &&
          job.provider.certainty === 'submitted' &&
          job.execution.cancellation &&
          cancellation &&
          !job.provider.cancellationAcknowledged &&
          (!job.provider.cancellationAttemptedAt || cancellation.retry === 'idempotent')
        ) {
          const cancelled = await cancellation.request(
            job.provider.operationId!,
            providerContext,
            () =>
              observe({
                phase: 'running',
                provider: {
                  ...job.provider,
                  cancellationAttemptedAt: new Date(deps.now()).toISOString(),
                },
              }),
          );
          if (
            cancelled.status === 'cancellation_requested' ||
            cancelled.status === 'cancellation_deferred'
          ) {
            const { cancellationAttemptedAt, ...provider } = job.provider;
            await observe({
              phase: 'running',
              provider: {
                ...provider,
                ...(cancelled.status === 'cancellation_requested'
                  ? { cancellationAttemptedAt }
                  : {}),
                cancellationAcknowledged: cancelled.status === 'cancellation_requested',
              },
              dueAt: new Date(deps.now() + context.config.polling.providerIntervalMs).toISOString(),
              releaseLease: true,
            });
            return;
          }
          result = cancelled;
        } else {
          result = await poll(job.provider.operationId, providerContext);
        }
      } else {
        await observe({
          phase: 'requires_attention',
          error: { code: 'submission_uncertain' },
          releaseLease: true,
        });
        return;
      }
      if (result.status === 'running') {
        await observe({
          phase: 'running',
          provider: { ...job.provider, certainty: 'submitted', operationId: result.operationId },
          dueAt: new Date(deps.now() + context.config.polling.providerIntervalMs).toISOString(),
          releaseLease: true,
        });
        return;
      }
      if (result.status === 'failed' || result.status === 'cancelled') {
        await observe({
          phase: 'reconciling',
          provider: {
            ...job.provider,
            certainty: 'terminal',
            recovery: { usage: result.usage, terminalStatus: result.status },
          },
        });
        await settle(result.usage, context);
        await observe({
          phase: result.status,
          provider: { ...job.provider, certainty: 'terminal' },
          ...(result.status === 'failed' ? { error: { code: 'provider_rejected' } } : {}),
        });
        return;
      }
      const recovered = job.provider.recovery;
      const recovery: NonNullable<MediaProviderState['recovery']> = recovered?.parts
        ? recovered
        : {
            terminalStatus: 'completed' as const,
            usage: result.usage,
            parts: result.parts.map((part) =>
              part.kind === 'text'
                ? part
                : {
                    kind: part.kind,
                    ordinal: part.ordinal,
                    type: part.type,
                    url: part.url,
                    thoughtSignature: part.thoughtSignature,
                  },
            ),
          };
      await observe({
        phase: 'ingesting',
        outputs: job.outputs,
        provider: { ...job.provider, certainty: 'terminal', recovery },
      });
      const outputs: MediaOutput[] = [...job.outputs];
      for (const part of result.parts) {
        const outputId = `${job.jobId}:${part.ordinal}`;
        if (
          outputs.some(
            (output) =>
              output.outputId === outputId && (output.kind === 'text' || output.state === 'ready'),
          )
        ) {
          continue;
        }
        if (part.kind === 'text') {
          outputs.push({ kind: 'text', outputId, ordinal: part.ordinal, text: part.text });
        } else {
          const original = await deps.storage.publish({
            scope: context.scope,
            outputKey: outputId,
            stream: part.data ? Readable.from([part.data]) : await download(part),
            type: part.type,
            filename: `${job.jobId}-${part.ordinal}.${mediaContentExtension(part.type)}`,
            config: context.config,
            expiredAt: new Date(deps.now() + context.config.assets.orphanRetentionMs).toISOString(),
          });
          const retained = await deps.repository.retainMediaThreadAsset({
            scope: context.scope,
            fileId: original.file_id,
            threadId: job.threadId,
            maxRetainers: context.config.limits.maxAssetRetainers,
          });
          outputs.push(
            retained
              ? {
                  kind: part.kind,
                  outputId,
                  ordinal: part.ordinal,
                  state: 'ready',
                  asset: original,
                }
              : {
                  kind: part.kind,
                  outputId,
                  ordinal: part.ordinal,
                  state: 'expired',
                  error: { code: 'output_expired' },
                },
          );
          const descriptor = recovery.parts?.find((entry) => entry.ordinal === part.ordinal);
          if (descriptor && descriptor.kind !== 'text') {
            descriptor.fileId = original.file_id;
          }
        }
        outputs.sort((a, b) => a.ordinal - b.ordinal);
        await observe({
          phase: 'ingesting',
          outputs,
          provider: {
            ...job.provider,
            certainty: 'terminal',
            recovery: {
              terminalStatus: 'completed',
              usage: result.usage,
              parts: (recovery.parts ?? []).map((item) => {
                if (item.kind === 'text') {
                  return item;
                }
                const output = outputs.find((entry) => entry.ordinal === item.ordinal);
                return {
                  ...item,
                  fileId:
                    output && output.kind !== 'text'
                      ? (output.asset?.file_id ?? item.fileId)
                      : item.fileId,
                };
              }),
            },
          },
        });
      }
      if (result.parts.length === 0 && recovered?.parts && outputs.length === 0) {
        throw new MediaServiceError('storage_failed', 409, 'Output recovery is incomplete.');
      }
      await settle(result.usage, context);
      await observe({
        phase: 'succeeded',
        outputs,
        provider: { ...job.provider, certainty: 'terminal' },
      });
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }
      attemptFailed = true;
      let code: MediaErrorCode = 'submission_uncertain';
      if (error instanceof MediaServiceError) code = error.code;
      else if (error instanceof MediaProviderError && error.certainty === 'rejected')
        code = 'provider_rejected';
      if (error instanceof MediaProviderError) {
        deps.log(
          new Error(
            `Media job ${job.jobId} provider request ${error.certainty} (${error.reason ?? 'unclassified'}).`,
            { cause: error },
          ),
        );
      } else if (!(error instanceof MediaServiceError)) {
        deps.log(new Error(`Media job ${job.jobId} failed unexpectedly.`, { cause: error }));
      }
      const safeRejection =
        job.provider.certainty === 'unsubmitted' ||
        (error instanceof MediaProviderError &&
          error.certainty === 'rejected' &&
          job.phase === 'submitting');
      try {
        if (
          context &&
          job.phase === 'ingesting' &&
          job.provider.certainty === 'terminal' &&
          error instanceof MediaServiceError &&
          ['unsupported', 'invalid_request', 'output_expired'].includes(error.code)
        ) {
          await settle(job.provider.recovery?.usage, context);
          await observe({
            phase: 'failed',
            error: { code },
            provider: { ...job.provider, certainty: 'terminal' },
          });
          return;
        }
        if (safeRejection) {
          if (context) {
            const currentContext = context;
            await recordSettlement(() => deps.accounting.release(job, currentContext));
          }
          await observe({
            phase: 'failed',
            error: { code },
            provider: {
              ...job.provider,
              certainty: job.provider.certainty === 'unsubmitted' ? 'unsubmitted' : 'terminal',
            },
          });
        } else {
          const retryIngestion =
            (job.provider.operationId || job.provider.certainty === 'terminal') &&
            !(
              error instanceof MediaServiceError &&
              [
                'credentials_required',
                'credentials_expired',
                'not_ready',
                'output_expired',
              ].includes(error.code)
            ) &&
            deps.now() - Date.parse(job.createdAt) <
              (context?.config.recovery.attentionAfterMs ?? baseConfig.recovery.attentionAfterMs);
          const recoveryPhase = job.provider.certainty === 'terminal' ? 'ingesting' : 'running';
          await observe({
            phase: retryIngestion ? recoveryPhase : 'requires_attention',
            error: { code },
            releaseLease: true,
            dueAt: new Date(deps.now() + baseConfig.polling.providerIntervalMs).toISOString(),
          });
        }
      } catch (reconciliation) {
        deps.log(
          new Error('Media reconciliation will resume after the job lease expires.', {
            cause: reconciliation,
          }),
        );
      }
    } finally {
      const attemptResult = attemptFailed ? 'failed' : 'completed';
      observeMedia(deps.observer, {
        ...mediaJobEvent(job),
        kind: 'attempt',
        result: controller.signal.aborted ? 'interrupted' : attemptResult,
        durationMs: deps.now() - startedAt,
      });
      clearInterval(renewal);
      controllers.delete(controller);
      await serial;
      await deps.repository.releaseMediaPermits({ scope: fence().scope, jobId: job.jobId });
    }
  }

  async function attempt<T>(
    message: string,
    operation: () => Promise<T>,
    kind?: 'cleanup' | 'settlement',
  ): Promise<T | undefined> {
    const start = deps.now();
    try {
      const result = await operation();
      if (kind)
        observeMedia(deps.observer, { kind, result: 'completed', durationMs: deps.now() - start });
      return result;
    } catch (cause) {
      if (kind)
        observeMedia(deps.observer, { kind, result: 'failed', durationMs: deps.now() - start });
      deps.log(new Error(message, { cause }));
      return undefined;
    }
  }

  async function maintain() {
    const now = new Date(deps.now()).toISOString();
    const [cleanup, permits, accounting] = await deps.asSystem(() =>
      Promise.all([
        attempt('The media worker could not discover cleanup work.', () =>
          deps.repository.listMediaCleanupScopes({
            now,
            limit: baseConfig.limits.pageSize,
            cursor: cleanupCursor,
          }),
        ),
        attempt('The media worker could not reconcile permits.', () =>
          deps.repository.reconcileMediaPermits({
            limit: baseConfig.limits.pageSize,
            cursor: permitCursor,
          }),
        ),
        attempt(
          'The media worker could not discover accounting work.',
          () =>
            deps.accounting.scopes?.({
              limit: baseConfig.limits.pageSize,
              cursor: accountingCursor,
            }) ?? Promise.resolve({ items: [], nextCursor: undefined }),
        ),
      ]),
    );
    if (cleanup) cleanupCursor = cleanup.nextCursor;
    if (permits) permitCursor = permits.nextCursor;
    if (accounting) accountingCursor = accounting.nextCursor;
    for (const scope of accounting?.items ?? []) {
      if (stopped) return;
      await attempt('Media accounting reconciliation needs another attempt.', () =>
        deps.withScope(scope, async () => {
          await deps.accounting.reconcile?.(scope, baseConfig);
        }),
      );
    }
    for (const scope of cleanup?.items ?? []) {
      if (stopped) return;
      await attempt('Media cleanup needs another attempt.', () =>
        deps.withScope(scope, async () => {
          await deps.repository.recoverMediaAssetWrites({
            scope,
            limit: baseConfig.limits.pageSize,
          });
          const staleBefore = new Date(
            deps.now() - baseConfig.assets.orphanRetentionMs,
          ).toISOString();
          const writes = await deps.repository.listMediaAssetWritesForCleanup({
            scope,
            staleBefore,
            limit: baseConfig.limits.pageSize,
          });
          for (const write of writes) {
            if (stopped) return;
            await attempt(
              'An abandoned media write could not be removed.',
              async () => {
                try {
                  await deps.storage.discardWrite(scope, write.writeId, staleBefore);
                } catch (error) {
                  await deps.deferAssetWriteDeletion?.(scope, write.writeId);
                  throw error;
                }
              },
              'cleanup',
            );
          }
          await deps.repository.reconcileMediaAccountDeletion({
            scope,
            limit: baseConfig.limits.pageSize,
          });
          await deps.reconcileNative?.(scope, baseConfig);
          await deps.migrateNativeConsumers?.(scope, baseConfig);
          await deps.repository.retireExpiredMediaThreads({
            scope,
            now,
            limit: baseConfig.limits.pageSize,
          });
          await deps.repository.reconcileMediaRetirements({
            scope,
            limit: baseConfig.limits.pageSize,
          });
          const expired = await deps.repository.listMediaExpiredAssets({
            scope,
            limit: baseConfig.limits.pageSize,
            now,
          });
          for (const asset of expired) {
            if (stopped) return;
            await attempt(
              'An expired media original could not be removed.',
              async () => {
                try {
                  await deps.storage.remove(scope, asset.file_id);
                } catch (error) {
                  await deps.deferAssetDeletion?.(scope, asset.file_id);
                  throw error;
                }
              },
              'cleanup',
            );
          }
        }),
      );
    }
    if (!stopped) await deps.sweepStaging?.(deps.now() - baseConfig.assets.orphanRetentionMs);
  }

  async function scan() {
    const scopes = await deps.asSystem(() =>
      deps.repository.listDueMediaScopes({
        now: new Date(deps.now()).toISOString(),
        limit: baseConfig.limits.maxPageSize,
        cursor: dueCursor,
      }),
    );
    dueCursor = scopes.nextCursor;
    for (const scope of scopes.items) {
      if (stopped || active.size >= baseConfig.execution.maxActiveTotal) break;
      await attempt('A media queue could not be scanned.', () =>
        deps.withScope(scope, async () => {
          await deps.repository.recoverMediaPublications({
            scope,
            limit: baseConfig.limits.pageSize,
            maxRetainers: baseConfig.limits.maxAssetRetainers,
            maxTitleChars: baseConfig.limits.maxTitleChars,
            temporaryRetentionMs: deps.temporaryRetentionMs,
          });
          if (stopped) return;
          const job = await deps.repository.claimMediaJob({
            scope,
            workerId,
            now: new Date(deps.now()).toISOString(),
            leaseMs: baseConfig.worker.leaseMs,
          });
          if (!job || stopped) return;
          const work = deps
            .withScope(scope, () => execute(job))
            .catch((cause: unknown) =>
              deps.log(new Error(`Media job ${job.jobId} needs reconciliation.`, { cause })),
            )
            .finally(() => active.delete(job.jobId));
          active.set(job.jobId, work);
        }),
      );
    }
  }

  function tick() {
    if (stopped || scanning) return;
    if (!maintaining) {
      maintaining = attempt('Media maintenance needs another attempt.', maintain)
        .then(() => undefined)
        .finally(() => {
          maintaining = undefined;
        });
    }
    scanning = attempt('The media worker could not scan pending work.', scan)
      .then(() => undefined)
      .finally(() => {
        scanning = undefined;
        if (!stopped) {
          timer = setTimeout(tick, baseConfig.worker.tickMs);
          timer.unref();
        }
      });
  }

  return {
    async start() {
      if (!stopped || starting) return starting;
      const generation = ++lifecycle;
      starting = (async () => {
        const activated =
          baseConfig.enabled || (await deps.asSystem(() => deps.repository.hasMediaActivation()));
        if (!activated || generation !== lifecycle) return;
        await Promise.all([
          deps.repository.ensureMediaIndexes(),
          deps.accounting.ensureReady?.(),
          deps.ensureReady?.(),
        ]);
        if (generation !== lifecycle) return;
        stopped = false;
        tick();
      })().finally(() => {
        starting = undefined;
      });
      return starting;
    },
    async stop() {
      stopped = true;
      lifecycle++;
      clearTimeout(timer);
      let deadline: ReturnType<typeof setTimeout> | undefined;
      const drain = async () => {
        await Promise.allSettled([starting, scanning, maintaining]);
        await Promise.allSettled(active.values());
      };
      await Promise.race([
        drain(),
        new Promise<void>((resolve) => {
          deadline = setTimeout(resolve, baseConfig.worker.shutdownTimeoutMs);
        }),
      ]);
      clearTimeout(deadline);
      for (const controller of controllers) {
        controller.abort();
      }
    },
    get available() {
      return !stopped;
    },
    runJob: execute,
  };
}
