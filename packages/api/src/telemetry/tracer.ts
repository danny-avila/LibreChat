import { SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';
import type { Attributes, Span, SpanOptions } from '@opentelemetry/api';

const TRACER_NAME = 'librechat.telemetry';

export interface TelemetrySpanOptions {
  attributes?: Attributes;
  kind?: SpanKind;
}

function getTracer() {
  return trace.getTracer(TRACER_NAME);
}

function recordSpanError(span: Span, error: unknown): void {
  span.recordException(error instanceof Error ? error : String(error));
  span.setStatus({ code: SpanStatusCode.ERROR });
}

function isPromiseLike<T>(value: T | Promise<T>): value is Promise<T> {
  return typeof (value as Promise<T>)?.then === 'function';
}

function toSpanOptions(options?: TelemetrySpanOptions): SpanOptions {
  return {
    kind: options?.kind ?? SpanKind.INTERNAL,
    attributes: filterAttributes(options?.attributes),
  };
}

function filterAttributes(attributes?: Attributes): Attributes | undefined {
  if (!attributes) {
    return undefined;
  }

  const entries = Object.entries(attributes).filter((entry) => entry[1] !== undefined);
  return entries.length > 0 ? (Object.fromEntries(entries) as Attributes) : undefined;
}

export function withTelemetrySpan<T>(
  name: string,
  options: TelemetrySpanOptions | undefined,
  fn: (span: Span) => Promise<T>,
): Promise<T>;
export function withTelemetrySpan<T>(
  name: string,
  options: TelemetrySpanOptions | undefined,
  fn: (span: Span) => T,
): T;
export function withTelemetrySpan<T>(
  name: string,
  options: TelemetrySpanOptions | undefined,
  fn: (span: Span) => T | Promise<T>,
): T | Promise<T> {
  return getTracer().startActiveSpan(name, toSpanOptions(options), (span) => {
    try {
      const result = fn(span);
      if (!isPromiseLike(result)) {
        span.end();
        return result;
      }

      return result
        .catch((error: unknown) => {
          recordSpanError(span, error);
          throw error;
        })
        .finally(() => {
          span.end();
        });
    } catch (error) {
      recordSpanError(span, error);
      span.end();
      throw error;
    }
  });
}
