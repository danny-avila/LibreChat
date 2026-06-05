import { SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';
import type { Span, Tracer } from '@opentelemetry/api';
import { withTelemetrySpan } from './tracer';

function createSpan(): jest.Mocked<Span> {
  const span = {} as jest.Mocked<Span>;
  span.addEvent = jest.fn<jest.Mocked<Span>, Parameters<Span['addEvent']>>(() => span);
  span.addLink = jest.fn<jest.Mocked<Span>, Parameters<Span['addLink']>>(() => span);
  span.addLinks = jest.fn<jest.Mocked<Span>, Parameters<Span['addLinks']>>(() => span);
  span.end = jest.fn<void, Parameters<Span['end']>>();
  span.isRecording = jest.fn<boolean, Parameters<Span['isRecording']>>(() => true);
  span.recordException = jest.fn<void, Parameters<Span['recordException']>>();
  span.setAttribute = jest.fn<jest.Mocked<Span>, Parameters<Span['setAttribute']>>(() => span);
  span.setAttributes = jest.fn<jest.Mocked<Span>, Parameters<Span['setAttributes']>>(() => span);
  span.setStatus = jest.fn<jest.Mocked<Span>, Parameters<Span['setStatus']>>(() => span);
  span.spanContext = jest.fn<ReturnType<Span['spanContext']>, Parameters<Span['spanContext']>>(
    () => ({
      spanId: '0000000000000000',
      traceFlags: 0,
      traceId: '00000000000000000000000000000000',
    }),
  );
  span.updateName = jest.fn<jest.Mocked<Span>, Parameters<Span['updateName']>>(() => span);
  return span;
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('telemetry tracer helpers', () => {
  it('ends successful active spans', () => {
    const span = createSpan();
    jest.spyOn(trace, 'getTracer').mockReturnValue({
      startActiveSpan: (_name: string, _options: unknown, fn: (span: Span) => unknown) => fn(span),
    } as unknown as Tracer);

    const result = withTelemetrySpan('librechat.test', undefined, () => 42);

    expect(result).toBe(42);
    expect(span.end).toHaveBeenCalledTimes(1);
  });

  it('filters undefined attributes when starting active spans', () => {
    const span = createSpan();
    const startActiveSpan = jest.fn(
      (_name: string, _options: unknown, fn: (span: Span) => unknown) => fn(span),
    );
    jest.spyOn(trace, 'getTracer').mockReturnValue({ startActiveSpan } as unknown as Tracer);

    withTelemetrySpan(
      'librechat.test',
      {
        attributes: {
          keep: 'value',
          drop: undefined,
        },
      },
      () => undefined,
    );

    expect(startActiveSpan).toHaveBeenCalledWith(
      'librechat.test',
      {
        kind: SpanKind.INTERNAL,
        attributes: { keep: 'value' },
      },
      expect.any(Function),
    );
  });

  it('ends successful async active spans after resolution', async () => {
    const span = createSpan();
    jest.spyOn(trace, 'getTracer').mockReturnValue({
      startActiveSpan: (_name: string, _options: unknown, fn: (span: Span) => unknown) => fn(span),
    } as unknown as Tracer);

    await expect(withTelemetrySpan('librechat.test', undefined, async () => 42)).resolves.toBe(42);

    expect(span.end).toHaveBeenCalledTimes(1);
  });

  it('records and rethrows span errors', () => {
    const span = createSpan();
    const error = new Error('boom');
    jest.spyOn(trace, 'getTracer').mockReturnValue({
      startActiveSpan: (_name: string, _options: unknown, fn: (span: Span) => unknown) => fn(span),
    } as unknown as Tracer);

    expect(() =>
      withTelemetrySpan('librechat.test', undefined, () => {
        throw error;
      }),
    ).toThrow(error);

    expect(span.recordException).toHaveBeenCalledWith(error);
    expect(span.setStatus).toHaveBeenCalledWith({ code: SpanStatusCode.ERROR });
    expect(span.end).toHaveBeenCalledTimes(1);
  });

  it('records async span errors before rethrowing', async () => {
    const span = createSpan();
    const error = new Error('boom');
    jest.spyOn(trace, 'getTracer').mockReturnValue({
      startActiveSpan: (_name: string, _options: unknown, fn: (span: Span) => unknown) => fn(span),
    } as unknown as Tracer);

    await expect(
      withTelemetrySpan('librechat.test', undefined, async () => {
        throw error;
      }),
    ).rejects.toThrow(error);

    expect(span.recordException).toHaveBeenCalledWith(error);
    expect(span.setStatus).toHaveBeenCalledWith({ code: SpanStatusCode.ERROR });
    expect(span.end).toHaveBeenCalledTimes(1);
  });
});
