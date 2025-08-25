import { trace } from '@opentelemetry/api';
import { setSpanAttributes, addEvent } from './utils.js';

/**
 * Express Middleware for Enhanced OpenTelemetry Instrumentation
 *
 * This middleware adds LibreChat-specific context to HTTP spans
 * and provides request correlation throughout the request lifecycle.
 */

/**
 * Middleware to enhance HTTP spans with LibreChat-specific attributes
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Next middleware function
 */
function tracingMiddleware(req, res, next) {
  const activeSpan = trace.getActiveSpan();

  if (activeSpan) {
    // Add LibreChat-specific attributes
    const attributes = {
      'librechat.route': req.route?.path || req.path,
      'librechat.user_agent': req.get('user-agent') || 'unknown',
      'librechat.request_id': req.id || req.get('x-request-id') || 'unknown',
      'librechat.method': req.method,
      'librechat.url': req.originalUrl || req.url,
    };

    // Add user context if available (from JWT or session)
    if (req.user) {
      attributes['librechat.user_id'] = req.user.id || req.user._id;
      attributes['librechat.user_email'] = req.user.email;
    }

    // Add conversation context if present
    if (req.body?.conversationId) {
      attributes['librechat.conversation_id'] = req.body.conversationId;
    }

    if (req.body?.model) {
      attributes['librechat.model'] = req.body.model;
    }

    if (req.body?.endpoint) {
      attributes['librechat.endpoint'] = req.body.endpoint;
    }

    // Add API route context
    if (req.path.startsWith('/api/')) {
      const apiPath = req.path.replace('/api/', '');
      attributes['librechat.api_endpoint'] = apiPath;

      // Mark as sensitive if it's an auth or key endpoint
      if (apiPath.startsWith('auth') || apiPath.startsWith('keys')) {
        attributes['librechat.sensitive'] = true;
      }
    }

    setSpanAttributes(attributes);

    // Add request start event
    addEvent('request.start', {
      'request.size': req.get('content-length') || 0,
      'request.encoding': req.get('content-encoding') || 'none',
    });

    // Track response
    const originalSend = res.send;
    res.send = function instrumentedSend(body) {
      // Calculate response size safely
      let responseSize = 0;
      if (body) {
        if (typeof body === 'string') {
          responseSize = Buffer.byteLength(body);
        } else if (Buffer.isBuffer(body)) {
          responseSize = body.length;
        } else {
          // For objects, convert to JSON string first
          responseSize = Buffer.byteLength(JSON.stringify(body));
        }
      }

      addEvent('request.complete', {
        'response.status_code': res.statusCode,
        'response.size': responseSize,
      });

      setSpanAttributes({
        'http.response.status_code': res.statusCode,
        'librechat.response_size': responseSize,
      });

      return originalSend.call(this, body);
    };
  }

  next();
}

/**
 * Middleware to track LLM-specific requests
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Next middleware function
 */
function llmTracingMiddleware(req, res, next) {
  // Only apply to LLM-related endpoints
  const llmEndpoints = ['/api/messages', '/api/edit', '/api/convos'];
  const isLLMEndpoint = llmEndpoints.some((endpoint) => req.path.startsWith(endpoint));

  if (isLLMEndpoint) {
    const activeSpan = trace.getActiveSpan();

    if (activeSpan) {
      addEvent('llm.request.start', {
        'llm.endpoint': req.path,
        'llm.method': req.method,
      });

      // Extract LLM-specific information from request body
      if (req.body) {
        const llmAttributes = {};

        if (req.body.model) {
          llmAttributes['llm.request.model'] = req.body.model;
        }

        if (req.body.messages && Array.isArray(req.body.messages)) {
          llmAttributes['llm.request.message_count'] = req.body.messages.length;
        }

        if (req.body.max_tokens) {
          llmAttributes['llm.request.max_tokens'] = req.body.max_tokens;
        }

        if (req.body.temperature !== undefined) {
          llmAttributes['llm.request.temperature'] = req.body.temperature;
        }

        if (req.body.stream !== undefined) {
          llmAttributes['llm.request.streaming'] = req.body.stream;
        }

        setSpanAttributes(llmAttributes);
      }
    }
  }

  next();
}

/**
 * Error handling middleware with tracing
 * @param {Error} err - Error object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Next middleware function
 */
function errorTracingMiddleware(err, req, res, next) {
  const activeSpan = trace.getActiveSpan();

  if (activeSpan && err) {
    // Record the exception
    activeSpan.recordException(err);

    // Add error attributes
    setSpanAttributes({
      'error.name': err.name,
      'error.message': err.message,
      'error.stack': err.stack,
      'librechat.error_endpoint': req.path,
    });

    addEvent('error.occurred', {
      'error.type': err.constructor.name,
      'error.handled': true,
    });
  }

  next(err);
}

export default {
  tracingMiddleware,
  llmTracingMiddleware,
  errorTracingMiddleware,
};
