const { logger } = require('@librechat/data-schemas');
const { refreshS3Url } = require('@librechat/api');
const { FileSources } = require('librechat-data-provider');

/**
 * Refresh window passed to the underlying per-source refresh helper. With the
 * default `S3_URL_EXPIRY_SECONDS=120`, any value larger than the TTL means
 * "always re-sign on read" — which is what we want here because the snapshot
 * in the message/toolcall document is never updated.
 */
const DEFAULT_BUFFER_SECONDS = 3600;

/**
 * Cap on concurrent refresh calls per response. A single conversation can
 * carry dozens of attachments; the refresh primitives are CPU-cheap (local
 * HMAC) but unbounded `Promise.all` over them can still spike event-loop
 * latency and, where a backend does need a network round-trip (e.g.
 * delegation key refresh), can hammer it. A small fixed limit keeps tail
 * latency bounded without measurably hurting throughput.
 */
const DEFAULT_CONCURRENCY = 8;

/**
 * Redact the query string from a signed URL before logging. Presigned URLs
 * are short-lived credentials (`X-Amz-Signature`, `X-Amz-Security-Token`,
 * etc. live in the query string); leaving them in log sinks defeats the
 * purpose of the TTL. For inputs that don't parse as URLs, fall back to
 * stripping anything after `?` — keeps the path component intact for
 * debugging without leaking credentials.
 *
 * @param {string} signedUrl
 * @returns {string}
 */
function redactSignedUrlForLog(signedUrl) {
  if (typeof signedUrl !== 'string') {
    return '';
  }
  try {
    const u = new URL(signedUrl);
    return `${u.origin}${u.pathname}`;
  } catch {
    const q = signedUrl.indexOf('?');
    return q === -1 ? signedUrl : signedUrl.slice(0, q);
  }
}

/**
 * @typedef {Object} AttachmentLike
 * @property {string} [source]
 * @property {string} [filepath]
 * @property {string} [storageKey]
 */

/**
 * Per-source refresh dispatch. Add a new entry here when another storage
 * backend grows a refresh primitive (e.g. Azure SAS).
 *
 * @type {Record<string, (att: AttachmentLike, bufferSeconds: number) => Promise<string>>}
 */
const refresherBySource = {
  [FileSources.s3]: (att, bufferSeconds) => refreshS3Url(att, bufferSeconds),
};

/**
 * Cheap eligibility check used at enqueue time so the concurrency pool only
 * runs tasks that can actually refresh something. Identical guards to those
 * inside `refreshAttachment`, lifted here so we don't allocate closures or
 * spin worker cursors over entries that will immediately no-op.
 *
 * @param {unknown} attachment
 * @returns {attachment is AttachmentLike}
 */
function isRefreshable(attachment) {
  if (!attachment || typeof attachment !== 'object') {
    return false;
  }
  const att = /** @type {AttachmentLike} */ (attachment);
  if (typeof att.filepath !== 'string' || att.filepath.length === 0) {
    return false;
  }
  return Object.prototype.hasOwnProperty.call(refresherBySource, att.source);
}

/**
 * Refresh a single attachment's `filepath` in place if it is a near-expiry
 * signed URL the backend owns. Non-eligible entries are left untouched. On
 * error the original URL is retained — the client gets a diagnosable 403
 * rather than a `null` href.
 *
 * @param {AttachmentLike | null | undefined} attachment
 * @param {number} bufferSeconds
 * @param {Map<string, Promise<string>>} cache - per-call memoization keyed on
 *   the original `filepath`, so repeated references to the same blob within
 *   one response only re-sign once.
 * @returns {Promise<void>}
 */
async function refreshAttachment(attachment, bufferSeconds, cache) {
  if (!isRefreshable(attachment)) {
    return;
  }
  const filepath = attachment.filepath;
  const refresher = refresherBySource[attachment.source];
  let pending = cache.get(filepath);
  if (!pending) {
    pending = (async () => {
      try {
        const newUrl = await refresher(attachment, bufferSeconds);
        return newUrl || filepath;
      } catch (error) {
        logger.error(
          `[refreshMessageAttachments] Error refreshing signed URL for "${redactSignedUrlForLog(filepath)}":`,
          error,
        );
        return filepath;
      }
    })();
    cache.set(filepath, pending);
  }
  const resolved = await pending;
  if (resolved && resolved !== filepath) {
    attachment.filepath = resolved;
  }
}

/**
 * Drain an array of async task factories with at most `concurrency` in
 * flight. No new dependency — small inline worker-pool.
 *
 * @param {Array<() => Promise<unknown>>} taskFactories
 * @param {number} concurrency
 * @returns {Promise<void>}
 */
async function runWithConcurrency(taskFactories, concurrency) {
  if (taskFactories.length === 0) {
    return;
  }
  const limit = Math.max(1, concurrency);
  if (taskFactories.length <= limit) {
    await Promise.all(taskFactories.map((fn) => fn()));
    return;
  }
  let cursor = 0;
  const workers = new Array(Math.min(limit, taskFactories.length)).fill(null).map(async () => {
    while (cursor < taskFactories.length) {
      const i = cursor++;
      await taskFactories[i]();
    }
  });
  await Promise.all(workers);
}

/**
 * Walk one or more messages or tool-call rows and refresh signed URLs
 * embedded in their `attachments[]` and `files[]` snapshots, in place.
 * Designed to wrap the response payload of read endpoints; safe to call with
 * `null`, `undefined`, `[]`, a single row, or an array. Returns the same
 * shape it was given so callers can drop it in front of `res.json` without
 * restructuring.
 *
 * The same function works against both message rows (which carry
 * `attachments[]` and `files[]`) and toolcall rows (which carry only
 * `attachments[]`) — the walker is duck-typed on the field names and skips
 * any that aren't arrays.
 *
 * @template {Record<string, unknown>} TRow
 * @param {TRow | TRow[] | null | undefined} rows
 * @param {{ bufferSeconds?: number, concurrency?: number }} [options]
 * @returns {Promise<TRow | TRow[] | null | undefined>}
 */
async function refreshMessageAttachmentUrls(rows, options = {}) {
  if (rows == null) {
    return rows;
  }
  const bufferSeconds = options.bufferSeconds ?? DEFAULT_BUFFER_SECONDS;
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  const list = Array.isArray(rows) ? rows : [rows];
  if (list.length === 0) {
    return rows;
  }
  const cache = new Map();
  const taskFactories = [];
  for (const row of list) {
    if (!row || typeof row !== 'object') {
      continue;
    }
    for (const field of ['attachments', 'files']) {
      const entries = /** @type {unknown} */ (row[field]);
      if (!Array.isArray(entries) || entries.length === 0) {
        continue;
      }
      for (const entry of entries) {
        // Skip non-refreshable entries (non-S3 source, missing filepath,
        // non-object) at enqueue time so the concurrency pool only runs
        // tasks that can actually refresh.
        if (!isRefreshable(entry)) {
          continue;
        }
        taskFactories.push(() => refreshAttachment(entry, bufferSeconds, cache));
      }
    }
  }
  await runWithConcurrency(taskFactories, concurrency);
  return rows;
}

module.exports = {
  refreshMessageAttachmentUrls,
  refreshAttachment,
  isRefreshable,
  redactSignedUrlForLog,
  runWithConcurrency,
  DEFAULT_BUFFER_SECONDS,
  DEFAULT_CONCURRENCY,
};
