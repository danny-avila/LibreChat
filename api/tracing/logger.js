import { addTraceContext } from './utils';

/**
 * Enhanced Logger with OpenTelemetry Trace Correlation
 *
 * This module wraps the existing Winston logger to automatically
 * include trace context (trace ID and span ID) in all log messages.
 */

// Import the existing logger configuration
import baseLogger from '../config/winston';

/**
 * Wrapper function that adds trace context to log messages
 * @param {string} level - Log level
 * @param {Function} originalMethod - Original logger method
 * @returns {Function} Enhanced logging method
 */
function wrapLogMethod(level, originalMethod) {
  return function enhancedLogMethod(message, meta = {}) {
    // Add trace context to metadata
    const enhancedMeta = addTraceContext(meta);

    // Call the original method with enhanced metadata
    return originalMethod.call(this, message, enhancedMeta);
  };
}

/**
 * Creates an enhanced logger with trace correlation
 * @param {winston.Logger} logger - Base Winston logger
 * @returns {winston.Logger} Enhanced logger
 */
function createTracingLogger(logger) {
  // Create a new logger instance that wraps the base logger
  const tracingLogger = Object.create(logger);

  // Wrap all logging methods
  const logLevels = ['error', 'warn', 'info', 'http', 'verbose', 'debug', 'activity', 'silly'];

  logLevels.forEach((level) => {
    if (typeof logger[level] === 'function') {
      tracingLogger[level] = wrapLogMethod(level, logger[level].bind(logger));
    }
  });

  // Wrap the generic log method
  if (typeof logger.log === 'function') {
    tracingLogger.log = function enhancedLog(level, message, meta = {}) {
      const enhancedMeta = addTraceContext(meta);
      return logger.log.call(this, level, message, enhancedMeta);
    };
  }

  return tracingLogger;
}

// Create the enhanced logger
const tracingLogger = createTracingLogger(baseLogger);

// Override console methods to include tracing (optional)
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;
const originalConsoleInfo = console.info;

if (process.env.OTEL_ENHANCE_CONSOLE === 'true') {
  console.log = function enhancedConsoleLog(...args) {
    const traceContext = addTraceContext();
    if (traceContext.trace && traceContext.trace.traceId) {
      args.push(`[trace: ${traceContext.trace.traceId}]`);
    }
    return originalConsoleLog.apply(this, args);
  };

  console.error = function enhancedConsoleError(...args) {
    const traceContext = addTraceContext();
    if (traceContext.trace && traceContext.trace.traceId) {
      args.push(`[trace: ${traceContext.trace.traceId}]`);
    }
    return originalConsoleError.apply(this, args);
  };

  console.warn = function enhancedConsoleWarn(...args) {
    const traceContext = addTraceContext();
    if (traceContext.trace && traceContext.trace.traceId) {
      args.push(`[trace: ${traceContext.trace.traceId}]`);
    }
    return originalConsoleWarn.apply(this, args);
  };

  console.info = function enhancedConsoleInfo(...args) {
    const traceContext = addTraceContext();
    if (traceContext.trace && traceContext.trace.traceId) {
      args.push(`[trace: ${traceContext.trace.traceId}]`);
    }
    return originalConsoleInfo.apply(this, args);
  };
}

export default tracingLogger;
