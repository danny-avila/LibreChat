const { logger } = require('@librechat/data-schemas');

// Mirror the agents tracer / Langfuse SDK base-URL resolution: LANGFUSE_BASE_URL,
// then the legacy LANGFUSE_BASEURL alias, then Langfuse Cloud. Enablement keys
// only on the credentials — a missing base URL just means Cloud — so a deployment
// that traces with the default URL still gets feedback scores.
const BASE =
  process.env.LANGFUSE_BASE_URL ?? process.env.LANGFUSE_BASEURL ?? 'https://cloud.langfuse.com';
const ENABLED = !!(process.env.LANGFUSE_PUBLIC_KEY && process.env.LANGFUSE_SECRET_KEY);
const AUTH = ENABLED
  ? 'Basic ' +
    Buffer.from(`${process.env.LANGFUSE_PUBLIC_KEY}:${process.env.LANGFUSE_SECRET_KEY}`).toString(
      'base64',
    )
  : null;
// Match the environment the @librechat/agents tracer emits traces under: it
// passes no environment, so @langfuse/otel falls back to
// LANGFUSE_TRACING_ENVIRONMENT and otherwise to Langfuse's own "default". Mirror
// that exactly (no NODE_ENV fallback) so the score is filed under the same
// environment as the trace it annotates — otherwise e.g. NODE_ENV=production
// would file the score under "production" while the trace stays on "default".
// When unset we omit `environment` so Langfuse defaults both to "default".
const ENV = process.env.LANGFUSE_TRACING_ENVIRONMENT;

/**
 * Send (or remove) a thumbs up/down score for a message's Langfuse trace.
 *
 * `traceId` is the deterministic id derived from the message id (see
 * `~/server/utils/langfuseTrace`), so no trace lookup is needed. The score
 * carries a stable `id` keyed off the trace so toggling the rating overwrites
 * the previous score rather than creating duplicates. Best-effort: any failure
 * is logged and swallowed by the caller so feedback UX never depends on Langfuse.
 *
 * @param {{ traceId: string, feedback: { rating?: 'thumbsUp'|'thumbsDown', tag?: string, text?: string } | null }} params
 */
async function sendFeedbackScore({ traceId, feedback }) {
  if (!ENABLED || !traceId) {
    return;
  }

  const scoreId = `feedback-${traceId}`;

  // Feedback cleared (re-clicked an active thumb): delete any existing score.
  if (!feedback || !feedback.rating) {
    const res = await fetch(`${BASE}/api/public/scores/${encodeURIComponent(scoreId)}`, {
      method: 'DELETE',
      headers: { Authorization: AUTH },
    });
    // 404 just means there was nothing to delete.
    if (!res.ok && res.status !== 404) {
      throw new Error(`langfuse score delete ${res.status}: ${await res.text()}`);
    }
    return;
  }

  const body = {
    id: scoreId,
    traceId,
    name: 'user-feedback',
    value: feedback.rating === 'thumbsUp' ? 1 : 0,
    dataType: 'BOOLEAN',
    comment: [feedback.tag, feedback.text].filter(Boolean).join(' — ') || undefined,
    metadata: { rating: feedback.rating, tag: feedback.tag },
    ...(ENV ? { environment: ENV } : {}),
  };

  const res = await fetch(`${BASE}/api/public/scores`, {
    method: 'POST',
    headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`langfuse score create ${res.status}: ${await res.text()}`);
  }
  logger.debug(`[langfuse] feedback score sent for trace ${traceId} (${feedback.rating})`);
}

module.exports = { sendFeedbackScore };
