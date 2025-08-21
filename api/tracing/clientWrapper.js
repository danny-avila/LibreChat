import { withLLMSpan } from './instrumentations';

/**
 * Simple LLM Client Wrapper for LibreChat
 *
 * This module provides basic instrumentation helpers for LLM clients.
 * It's simplified to use standard OpenTelemetry patterns without complex
 * automatic instrumentation.
 */

/**
 * Wraps an LLM call with tracing
 * @param {string} provider - Provider name (openai, anthropic, etc.)
 * @param {string} operation - Operation name (chat, completion, etc.)
 * @param {Object} attributes - Additional span attributes
 * @param {Function} fn - Function to execute
 * @returns {Promise|any} Result of the function
 */
function traceLLMCall(provider, operation, attributes = {}, fn) {
  return withLLMSpan(provider, operation, attributes, fn);
}

/**
 * Helper to create a traced LLM operation
 * @param {string} provider - Provider name
 * @param {Object} options - Request options/payload
 * @param {Function} clientCall - The actual client call function
 * @returns {Promise} Traced result
 */
function traceClientCall(provider, options, clientCall) {
  const attributes = {};

  // Add basic attributes from options
  if (options?.model) {
    attributes['llm.model'] = options.model;
  }
  if (options?.max_tokens) {
    attributes['llm.max_tokens'] = options.max_tokens;
  }
  if (options?.temperature !== undefined) {
    attributes['llm.temperature'] = options.temperature;
  }

  return traceLLMCall(provider, 'request', attributes, () => clientCall());
}

export default {
  traceLLMCall,
  traceClientCall,
};
