import { SpanStatusCode } from '@opentelemetry/api';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { createMediaLifecycleObserver, observeMedia } from './telemetry';

it('keeps durable job correlation in traces while limiting metrics to finite lifecycle dimensions', async () => {
  const exporter = new InMemorySpanExporter();
  const provider = new BasicTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] });
  const metrics = jest.fn();
  const observer = createMediaLifecycleObserver({
    tracer: provider.getTracer('test'),
    metrics,
    now: () => 5000,
  });
  observer({
    jobId: 'durable-job',
    tenantId: 'tenant-a',
    api: 'openai.images',
    operation: 'image.generate',
    kind: 'transition',
    phase: 'requires_attention',
    previousPhase: 'submitting',
    result: 'completed',
    durationMs: 1200,
    version: 7,
  });
  observer({
    jobId: 'durable-job',
    tenantId: 'tenant-a',
    api: 'openai.images',
    operation: 'image.generate',
    kind: 'settlement',
    phase: 'failed',
    result: 'completed',
    durationMs: 500,
    version: 11,
  });
  await provider.forceFlush();
  expect(exporter.getFinishedSpans()).toHaveLength(2);
  for (const span of exporter.getFinishedSpans()) {
    expect(span.attributes).toMatchObject({
      'librechat.media.job.id': 'durable-job',
      'librechat.tenant.id': 'tenant-a',
    });
    expect(span.status.code).toBe(SpanStatusCode.ERROR);
  }
  expect(metrics.mock.calls[0][0]).not.toHaveProperty('jobId');
  expect(metrics.mock.calls[0][0]).not.toHaveProperty('tenantId');
  expect(exporter.getFinishedSpans()[0].duration).toEqual([1, 200_000_000]);
  await provider.shutdown();
});

it('isolates broken metrics and lifecycle exporters, including disabled telemetry', async () => {
  const exporter = new InMemorySpanExporter();
  const provider = new BasicTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] });
  const observer = createMediaLifecycleObserver({
    tracer: provider.getTracer('test'),
    metrics: () => {
      throw new Error('offline');
    },
  });
  expect(() => observeMedia(observer, { kind: 'cleanup', result: 'failed' })).not.toThrow();
  expect(() =>
    observeMedia(
      () => {
        throw new Error('offline');
      },
      { kind: 'attempt', result: 'started' },
    ),
  ).not.toThrow();
  expect(() => observeMedia(undefined, { kind: 'attempt', result: 'started' })).not.toThrow();
  await provider.forceFlush();
  expect(exporter.getFinishedSpans()).toHaveLength(1);
  expect(exporter.getFinishedSpans()[0].events).toEqual([]);
  await provider.shutdown();
});
