import { trace, context, SpanKind, SpanStatusCode } from '@opentelemetry/api';

/**
 * Custom Instrumentations for LibreChat
 *
 * This module provides simple custom instrumentation utilities for:
 * - Creating custom spans for business logic
 * - Basic LLM call tracking
 * - Error recording and status management
 */

// Get tracer instance
const tracer = trace.getTracer('librechat-custom', process.env.OTEL_SERVICE_VERSION || '0.8.0');

/**
 * Creates a span for business logic operations
 * @param {string} name - Operation name
 * @param {Object} attributes - Additional attributes
 * @param {Function} fn - Function to execute within the span
 * @returns {Promise|any} Result of the function
 */
function withSpan(name, attributes = {}, fn) {
  const span = tracer.startSpan(name, {
    kind: SpanKind.INTERNAL,
    attributes: {
      'service.name': 'librechat',
      ...attributes,
    },
  });

  return context.with(trace.setSpan(context.active(), span), () => {
    try {
      const result = fn(span);

      if (result && typeof result.then === 'function') {
        return result
          .then((res) => {
            span.setStatus({ code: SpanStatusCode.OK });
            span.end();
            return res;
          })
          .catch((error) => {
            span.recordException(error);
            span.setStatus({
              code: SpanStatusCode.ERROR,
              message: error.message,
            });
            span.end();
            throw error;
          });
      }

      span.setStatus({ code: SpanStatusCode.OK });
      span.end();
      return result;
    } catch (error) {
      span.recordException(error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error.message,
      });
      span.end();
      throw error;
    }
  });
}

/**
 * Creates a simple span for LLM operations
 * @param {string} provider - LLM provider name (openai, anthropic, etc.)
 * @param {string} operation - Operation name (chat, completion, etc.)
 * @param {Object} attributes - Additional attributes
 * @param {Function} fn - Function to execute within the span
 * @returns {Promise|any} Result of the function
 */
function withLLMSpan(provider, operation, attributes = {}, fn) {
  const spanName = `llm.${provider}.${operation}`;
  const span = tracer.startSpan(spanName, {
    kind: SpanKind.CLIENT,
    attributes: {
      'llm.provider': provider,
      'llm.operation': operation,
      ...attributes,
    },
  });

  return context.with(trace.setSpan(context.active(), span), () => {
    try {
      const result = fn(span);

      if (result && typeof result.then === 'function') {
        return result
          .then((res) => {
            // Add basic response attributes if available
            if (res && typeof res === 'object') {
              if (res.usage) {
                span.setAttributes({
                  'llm.usage.total_tokens': res.usage.total_tokens || 0,
                  'llm.usage.prompt_tokens': res.usage.prompt_tokens || 0,
                  'llm.usage.completion_tokens': res.usage.completion_tokens || 0,
                });
              }
              if (res.model) {
                span.setAttributes({ 'llm.model': res.model });
              }
            }

            span.setStatus({ code: SpanStatusCode.OK });
            span.end();
            return res;
          })
          .catch((error) => {
            span.recordException(error);
            span.setStatus({
              code: SpanStatusCode.ERROR,
              message: error.message,
            });
            span.end();
            throw error;
          });
      }

      span.setStatus({ code: SpanStatusCode.OK });
      span.end();
      return result;
    } catch (error) {
      span.recordException(error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error.message,
      });
      span.end();
      throw error;
    }
  });
}

/**
 * Gets the current trace ID for correlation
 * @returns {string} Current trace ID or empty string
 */
function getCurrentTraceId() {
  const activeSpan = trace.getActiveSpan();
  if (activeSpan) {
    const spanContext = activeSpan.spanContext();
    return spanContext.traceId;
  }
  return '';
}

/**
 * Gets the current span ID for correlation
 * @returns {string} Current span ID or empty string
 */
function getCurrentSpanId() {
  const activeSpan = trace.getActiveSpan();
  if (activeSpan) {
    const spanContext = activeSpan.spanContext();
    return spanContext.spanId;
  }
  return '';
}

export default {
  tracer,
  withSpan,
  withLLMSpan,
  getCurrentTraceId,
  getCurrentSpanId,
};
