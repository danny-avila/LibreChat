const crypto = require('crypto');

/**
 * Deterministic Langfuse/OTEL trace id derived from a LibreChat message id.
 *
 * Mirrors `@langfuse/tracing`'s `createTraceId(seed)` exactly:
 * SHA-256 of the UTF-8 seed, hex-encoded, first 32 chars (a valid 16-byte OTEL trace id).
 * Seeding the agent run's trace with this id lets us later attach a feedback score
 * to the same trace using only the message id — no trace lookup required.
 */
const traceIdForMessage = (messageId) =>
  crypto.createHash('sha256').update(String(messageId), 'utf8').digest('hex').slice(0, 32);

module.exports = { traceIdForMessage };
