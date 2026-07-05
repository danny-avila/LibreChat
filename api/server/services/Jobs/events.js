const { EventEmitter } = require('events');

/**
 * In-process pub/sub for live job progress. The worker publishes an update
 * after every step; SSE connections (`GET /api/jobs/:id/events`) subscribe and
 * relay updates to the browser so an open tab reflects progress in real time.
 *
 * Scope & multi-instance note: this emitter is per-process. Live push therefore
 * works when the SSE connection and the worker step run on the same instance.
 * Correctness never depends on it — every update is first persisted to MongoDB,
 * so a client on another instance (or one that reconnects) always gets the full
 * state from the snapshot + polling path. The emitter is a latency optimization
 * on top of durable state, mirroring how the rest of the app treats streaming.
 */

const emitter = new EventEmitter();
/** Many tabs/among many jobs can listen at once; lift the default cap. */
emitter.setMaxListeners(0);

/** Channel name for a specific job's updates. */
function channel(jobId) {
  return `job:${String(jobId)}`;
}

/**
 * Publishes a job update to any local subscribers.
 *
 * @param {string} jobId
 * @param {{ type: 'step' | 'status', job: object }} payload
 */
function publishJobUpdate(jobId, payload) {
  emitter.emit(channel(jobId), payload);
}

/**
 * Subscribes to a job's updates. Returns an unsubscribe function.
 *
 * @param {string} jobId
 * @param {(payload: { type: string, job: object }) => void} listener
 * @returns {() => void}
 */
function subscribeToJob(jobId, listener) {
  const name = channel(jobId);
  emitter.on(name, listener);
  return () => emitter.off(name, listener);
}

module.exports = { publishJobUpdate, subscribeToJob };
