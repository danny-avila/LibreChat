import { trace, context } from '@opentelemetry/api';

/**
 * Tracing Utilities for LibreChat
 *
 * This module provides utility functions for working with OpenTelemetry
 * throughout the LibreChat application.
 */

/**
 * Gets the current active span
 * @returns {Span|undefined} Current active span
 */
function getActiveSpan() {
  return trace.getActiveSpan();
}

/**
 * Gets the current trace ID for logging correlation
 * @returns {string} Current trace ID or empty string
 */
function getTraceId() {
  const activeSpan = trace.getActiveSpan();
  if (activeSpan) {
    const spanContext = activeSpan.spanContext();
    return spanContext.traceId;
  }
  return '';
}

/**
 * Gets the current span ID for logging correlation
 * @returns {string} Current span ID or empty string
 */
function getSpanId() {
  const activeSpan = trace.getActiveSpan();
  if (activeSpan) {
    const spanContext = activeSpan.spanContext();
    return spanContext.spanId;
  }
  return '';
}

/**
 * Adds trace context to log messages
 * @param {Object} logObject - Log object to enhance
 * @returns {Object} Enhanced log object with trace context
 */
function addTraceContext(logObject = {}) {
  const traceId = getTraceId();
  const spanId = getSpanId();

  if (traceId || spanId) {
    return {
      ...logObject,
      trace: {
        traceId,
        spanId,
      },
    };
  }
  
  return logObject;
}

/**
 * Wraps a function with a custom span
 * @param {string} spanName - Name of the span
 * @param {Function} fn - Function to wrap
 * @param {Object} attributes - Additional span attributes
 * @returns {Function} Wrapped function
 */
function withTracing(spanName, fn, attributes = {}) {
  return function tracedFunction(...args) {
    const tracer = trace.getTracer('librechat-utils');
    const span = tracer.startSpan(spanName, { attributes });

    return context.with(trace.setSpan(context.active(), span), () => {
      try {
        const result = fn.apply(this, args);

        if (result && typeof result.then === 'function') {
          return result
            .then((res) => {
              span.end();
              return res;
            })
            .catch((error) => {
              span.recordException(error);
              span.end();
              throw error;
            });
        }

        span.end();
        return result;
      } catch (error) {
        span.recordException(error);
        span.end();
        throw error;
      }
    });
  };
}

/**
 * Sets attributes on the current active span
 * @param {Object} attributes - Attributes to set
 */
function setSpanAttributes(attributes) {
  const activeSpan = trace.getActiveSpan();
  if (activeSpan && attributes) {
    activeSpan.setAttributes(attributes);
  }
}

/**
 * Records an exception on the current active span
 * @param {Error} error - Error to record
 */
function recordException(error) {
  const activeSpan = trace.getActiveSpan();
  if (activeSpan && error) {
    activeSpan.recordException(error);
  }
}

/**
 * Adds an event to the current active span
 * @param {string} name - Event name
 * @param {Object} attributes - Event attributes
 */
function addEvent(name, attributes = {}) {
  const activeSpan = trace.getActiveSpan();
  if (activeSpan) {
    activeSpan.addEvent(name, attributes);
  }
}

export {
  getActiveSpan,
  getTraceId,
  getSpanId,
  addTraceContext,
  withTracing,
  setSpanAttributes,
  recordException,
  addEvent,
};
