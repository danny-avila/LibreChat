import { ROOT_CONTEXT, SpanKind, SpanStatusCode } from '@opentelemetry/api';
import type { MediaApi, MediaJobPhase, MediaOperation } from 'librechat-data-provider';
import type { MediaStoredJob } from '@librechat/data-schemas';
import type { Tracer } from '@opentelemetry/api';

export type MediaLifecycleEvent = {
  kind: 'attempt' | 'transition' | 'settlement' | 'cleanup' | 'cancellation';
  result: 'started' | 'completed' | 'failed' | 'interrupted';
  durationMs?: number;
  queueWaitMs?: number;
  /** Correlation belongs in traces, never metric labels. */
  jobId?: string;
  tenantId?: string | null;
  api?: MediaApi;
  operation?: MediaOperation;
  executionOwner?: 'media' | 'chat';
  phase?: MediaJobPhase;
  previousPhase?: MediaJobPhase;
  version?: number;
};
export type MediaLifecycleObserver = (event: MediaLifecycleEvent) => void;
export type MediaMetricEvent = Pick<
  MediaLifecycleEvent,
  | 'kind'
  | 'result'
  | 'api'
  | 'operation'
  | 'executionOwner'
  | 'phase'
  | 'durationMs'
  | 'queueWaitMs'
>;

/** A broken telemetry exporter must never change a paid request's outcome. */
export function observeMedia(
  observer: MediaLifecycleObserver | undefined,
  event: MediaLifecycleEvent,
): void {
  try {
    observer?.(event);
  } catch {
    /* Telemetry is best effort; no provider data in diagnostic logs. */
  }
}

export function mediaJobEvent(
  job: MediaStoredJob,
): Pick<
  MediaLifecycleEvent,
  'jobId' | 'tenantId' | 'api' | 'operation' | 'executionOwner' | 'phase' | 'version'
> {
  return {
    jobId: job.jobId,
    tenantId: job.tenantId,
    api: job.execution.api,
    operation: job.operation,
    executionOwner: job.executionOwner,
    phase: job.phase,
    version: job.version,
  };
}

/** Uses the host's existing tracer and registry, with no separate exporter or global recorder. */
export function createMediaLifecycleObserver({
  tracer,
  metrics,
  now = Date.now,
}: {
  tracer: Tracer;
  metrics?: (event: MediaMetricEvent) => void;
  now?: () => number;
}): MediaLifecycleObserver {
  return (event) => {
    const { kind, result, api, operation, executionOwner, phase, durationMs, queueWaitMs } = event;
    try {
      metrics?.({ kind, result, api, operation, executionOwner, phase, durationMs, queueWaitMs });
    } catch {
      /* Preserve tracing when metrics fails. */
    }
    const endedAt = now();
    const duration = Number.isFinite(durationMs) ? Math.max(0, durationMs ?? 0) : 0;
    const span = tracer.startSpan(
      `librechat.media.${kind}`,
      {
        kind: SpanKind.INTERNAL,
        startTime: new Date(endedAt - duration),
        attributes: {
          'librechat.media.event': kind,
          'librechat.media.result': result,
          ...(api ? { 'librechat.media.api': api } : {}),
          ...(operation ? { 'librechat.media.operation': operation } : {}),
          ...(executionOwner ? { 'librechat.media.execution_owner': executionOwner } : {}),
          ...(phase ? { 'librechat.media.phase': phase } : {}),
          ...(event.previousPhase ? { 'librechat.media.previous_phase': event.previousPhase } : {}),
          ...(event.jobId ? { 'librechat.media.job.id': event.jobId } : {}),
          ...(event.tenantId ? { 'librechat.tenant.id': event.tenantId } : {}),
          ...(event.version !== undefined ? { 'librechat.media.version': event.version } : {}),
          ...(queueWaitMs !== undefined ? { 'librechat.media.queue_wait_ms': queueWaitMs } : {}),
        },
      },
      ROOT_CONTEXT,
    );
    if (result === 'failed' || phase === 'requires_attention' || phase === 'failed') {
      span.setStatus({ code: SpanStatusCode.ERROR });
    }
    span.end(new Date(endedAt));
  };
}
