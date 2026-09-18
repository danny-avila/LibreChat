import { Readable } from 'node:stream';
import type {
  MediaConfig,
  MediaIntegration,
  MediaErrorCode,
  MediaOutput,
} from 'librechat-data-provider';
import type {
  MediaJobObservation,
  MediaStoredJob,
  MediaProviderState,
} from '@librechat/data-schemas';
import type { MediaProviderContext, MediaProviderPart, MediaProviderResult } from './provider';
import type { MediaServices, MediaServiceDependencies, MediaContext } from './service';
import { assertMediaAccess, mediaAccountingMode } from './service';
import { MediaServiceError, MediaProviderError } from './errors';
import { mediaContentExtension } from './content';

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
  let scanning = false;
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
    const controller = new AbortController();
    controllers.add(controller);
    let context: MediaContext | undefined;
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
        job = changed;
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
      const configuredIntegration = context.config.integrations.find(
        (entry) => entry.id === job.execution.connectionId,
      );
      if (job.phase === 'queued' && configuredIntegration?.enabled === false) {
        throw new MediaServiceError('forbidden', 403, 'This media provider is disabled.');
      }
      const integration: MediaIntegration | undefined =
        configuredIntegration ??
        (job.phase !== 'queued' && job.execution.endpointRef
          ? {
              id: job.execution.connectionId,
              api: job.execution.api,
              endpointRef: job.execution.endpointRef,
              catalog: { kind: 'configured', models: [job.execution.modelId] },
              operations: [job.operation],
              billing: job.execution.billing,
            }
          : undefined);
      const adapter = adapters.get(job.execution.api);
      if (!integration || !adapter) {
        throw new MediaServiceError(
          'not_ready',
          409,
          'The original media connection is unavailable.',
        );
      }
      const connection = await deps.resolveConnection({
        scope: context.scope,
        integration,
        appConfig: context.appConfig,
        minValidityMs: context.config.credentials.minValidityAtDispatchMs,
      });
      if (connection.binding !== job.execution.bindingRevision) {
        throw new MediaServiceError(
          'credentials_required',
          409,
          'The original provider credential binding changed.',
        );
      }
      const providerContext: MediaProviderContext = {
        connection,
        config: context.config,
        transport: deps.transport,
        signal: controller.signal,
      };
      let result: MediaProviderResult;
      if (job.phase === 'queued') {
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
            error: { code: 'quota_exceeded' },
          });
          return;
        }
        const permits = [
          { kind: 'deployment' as const, capacity: context.config.execution.maxActiveTotal },
          {
            kind: 'integration' as const,
            capacity: context.config.execution.maxActivePerIntegration,
            key: integration.id,
          },
          { kind: 'owner' as const, capacity: context.config.execution.maxActivePerUser },
        ];
        for (const permit of permits) {
          if (
            !(await deps.repository.acquireMediaPermit({
              scope: context.scope,
              jobId: job.jobId,
              ...permit,
            }))
          ) {
            await observe({
              phase: 'queued',
              dueAt: new Date(deps.now() + context.config.worker.tickMs).toISOString(),
              releaseLease: true,
            });
            return;
          }
        }
        const prepared = await services.prepare(job.request, context, false, controller.signal);
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
        });
        result = await adapter.submit(job.request, prepared.inputs, providerContext);
      } else if (
        job.provider.certainty === 'terminal' &&
        job.provider.recovery?.terminalStatus &&
        job.provider.recovery.terminalStatus !== 'completed'
      ) {
        result = {
          status: job.provider.recovery.terminalStatus,
          usage: job.provider.recovery.usage,
        };
      } else if (job.provider.operationId && adapter.poll) {
        result = await adapter.poll(job.provider.operationId, providerContext);
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
          provider: { certainty: 'submitted', operationId: result.operationId },
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
        await deps.accounting.settle(job, result.usage, context);
        await observe({
          phase: result.status,
          provider: { ...job.provider, certainty: 'terminal' },
          error: { code: 'provider_rejected' },
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
            stream: part.data
              ? Readable.from([part.data])
              : await adapter.download(part, providerContext),
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
      await deps.accounting.settle(job, result.usage, context);
      await observe({
        phase: 'succeeded',
        outputs,
        provider: { ...job.provider, certainty: 'terminal' },
      });
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }
      let code: MediaErrorCode = 'submission_uncertain';
      if (error instanceof MediaServiceError) code = error.code;
      else if (error instanceof MediaProviderError && error.certainty === 'rejected')
        code = 'provider_rejected';
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
          await deps.accounting.settle(job, job.provider.recovery?.usage, context);
          await observe({
            phase: 'failed',
            error: { code },
            provider: { ...job.provider, certainty: 'terminal' },
          });
          return;
        }
        if (safeRejection) {
          if (context) {
            await deps.accounting.release(job, context);
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
      } catch {
        deps.log(new Error('Media reconciliation will resume after the job lease expires.'));
      }
    } finally {
      clearInterval(renewal);
      controllers.delete(controller);
      await serial;
      await deps.repository.releaseMediaPermits({ scope: fence().scope, jobId: job.jobId });
    }
  }

  async function tick() {
    if (stopped || scanning) {
      return;
    }
    scanning = true;
    try {
      const now = new Date(deps.now()).toISOString();
      const [scopes, cleanup, permits, accounting] = await deps.asSystem(() =>
        Promise.all([
          deps.repository.listDueMediaScopes({
            now,
            limit: baseConfig.limits.maxPageSize,
            cursor: dueCursor,
          }),
          deps.repository.listMediaCleanupScopes({
            now,
            limit: baseConfig.limits.pageSize,
            cursor: cleanupCursor,
          }),
          deps.repository.reconcileMediaPermits({
            limit: baseConfig.limits.pageSize,
            cursor: permitCursor,
          }),
          deps.accounting.scopes?.({
            limit: baseConfig.limits.pageSize,
            cursor: accountingCursor,
          }) ?? Promise.resolve({ items: [], nextCursor: undefined }),
        ]),
      );
      dueCursor = scopes.nextCursor;
      cleanupCursor = cleanup.nextCursor;
      permitCursor = permits.nextCursor;
      accountingCursor = accounting.nextCursor;
      for (const scope of accounting.items) {
        await deps.withScope(scope, async () => {
          await deps.accounting.reconcile?.(scope, baseConfig);
        });
      }
      for (const scope of cleanup.items) {
        await deps.withScope(scope, async () => {
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
            await deps.storage.discardWrite(scope, write.writeId, staleBefore);
          }
          await deps.repository.reconcileMediaAccountDeletion({
            scope,
            limit: baseConfig.limits.pageSize,
          });
          await deps.reconcileNative?.(scope, baseConfig);
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
            await deps.storage.remove(scope, asset.file_id);
          }
        });
      }
      for (const scope of scopes.items) {
        if (stopped || active.size >= baseConfig.execution.maxActiveTotal) {
          break;
        }
        await deps.withScope(scope, async () => {
          await deps.repository.recoverMediaPublications({
            scope,
            limit: baseConfig.limits.pageSize,
            maxRetainers: baseConfig.limits.maxAssetRetainers,
            maxTitleChars: baseConfig.limits.maxTitleChars,
            temporaryRetentionMs: deps.temporaryRetentionMs,
          });
          const job = await deps.repository.claimMediaJob({
            scope,
            workerId,
            now: new Date(deps.now()).toISOString(),
            leaseMs: baseConfig.worker.leaseMs,
          });
          if (!job) {
            return;
          }
          const work = deps
            .withScope(scope, () => execute(job))
            .catch(() => deps.log(new Error('Media work needs reconciliation.')))
            .finally(() => active.delete(job.jobId));
          active.set(job.jobId, work);
        });
      }
    } catch {
      deps.log(new Error('The media worker could not scan pending work.'));
    } finally {
      scanning = false;
      if (!stopped) {
        timer = setTimeout(() => void tick(), baseConfig.worker.tickMs);
        timer.unref();
      }
    }
  }

  return {
    async start() {
      if (!stopped) {
        return;
      }
      const activated =
        baseConfig.enabled || (await deps.asSystem(() => deps.repository.hasMediaActivation()));
      if (!activated) {
        return;
      }
      await Promise.all([
        deps.repository.ensureMediaIndexes(),
        deps.accounting.ensureReady?.(),
        deps.ensureReady?.(),
      ]);
      stopped = false;
      void tick();
    },
    async stop() {
      stopped = true;
      clearTimeout(timer);
      let deadline: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([
        Promise.allSettled(active.values()),
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
