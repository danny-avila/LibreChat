import { randomUUID } from 'crypto';
import { logger } from '@librechat/data-schemas';
import type { TFile } from 'librechat-data-provider';
import type { SteerFileFetcher } from './media';
import { STEER_ENQUEUE_NOT_RUNNING, STEER_ENQUEUE_QUEUE_FULL } from '~/stream/interfaces/IJobStore';
import { toSteerFileRef, collectFileIds, buildOwnerFilter } from './refs';
import { GenerationJobManager } from '~/stream/GenerationJobManager';
import { isSteeringSupported } from './runtime';

/** Attachment cap per steer, mirroring the composer's practical limits. */
export const STEER_MAX_FILES = 10;

const DEFAULT_STEER_MAX_LENGTH = 16000;

/** Character cap for a single steer message (env-overridable). */
export function getSteerMaxLength(): number {
  return parseInt(process.env.STEER_MAX_LENGTH ?? '', 10) || DEFAULT_STEER_MAX_LENGTH;
}

export interface SteerRequestUser {
  id?: string;
  tenantId?: string;
}

export interface SteerRequestBody {
  conversationId?: unknown;
  text?: unknown;
  files?: unknown;
}

export interface SteerCancelBody {
  conversationId?: unknown;
  steerId?: unknown;
}

/** HTTP-shaped outcome the thin route wrapper serializes verbatim. */
export interface SteerRequestResult {
  status: number;
  body: Record<string, unknown>;
}

/** The originating run's identity, from job metadata (never the request). */
export interface SteerRunContext {
  agentId?: string;
  endpoint?: string;
}

/**
 * Host-injected dependencies for the steer guard ladder. All optional — a
 * host that omits them gets shape-level sanitization only (pre-round-13
 * behavior); the LibreChat route wires all three.
 */
export interface SteerRequestDeps {
  /** Owner-scoped file fetch (`db.getFiles`-shaped). When present, every
   *  client-supplied ref must resolve to an owned DB doc at enqueue and the
   *  queued refs are replaced with DB-derived ones. */
  getFiles?: SteerFileFetcher;
  /** Marks resolved uploads used so the upload-window TTL cannot reap a file
   *  the persisted steer part references (parity with normal sends). */
  updateFilesUsage?: (
    files: Array<{ file_id: string }>,
    fileIds?: string[],
    options?: { user?: string; tenantId?: string | null },
  ) => Promise<unknown[]>;
  /** Agent authorization for the originating run (role + per-agent ACL),
   *  mirroring the chat route's middlewares. `false` → 403 FORBIDDEN. */
  checkAgentAccess?: (run: SteerRunContext) => Promise<boolean>;
}

interface SanitizedFilesResult {
  files?: Partial<TFile>[];
  error?: 'TOO_MANY_FILES' | 'INVALID_FILES';
}

/** Sanitizes client-supplied attachment refs via the shared ref picker;
 *  a single unusable entry rejects the whole list (fail-loud for the client). */
function sanitizeSteerFiles(rawFiles: unknown): SanitizedFilesResult {
  if (!Array.isArray(rawFiles) || rawFiles.length === 0) {
    return {};
  }
  if (rawFiles.length > STEER_MAX_FILES) {
    return { error: 'TOO_MANY_FILES' };
  }
  const files: Partial<TFile>[] = [];
  for (const raw of rawFiles) {
    const ref = toSteerFileRef(raw);
    if (ref == null) {
      return { error: 'INVALID_FILES' };
    }
    files.push(ref);
  }
  return { files };
}

interface ResolvedFilesResult {
  files?: Partial<TFile>[];
  fileIds?: string[];
  error?: 'INVALID_FILES';
}

/**
 * Resolves sanitized client refs against the DB owner-scoped (same scoping as
 * the injection-time fetch) and re-derives every ref from the owned doc, so
 * only trusted shapes are ever queued, persisted, and rendered. Any id that
 * does not resolve fails the whole list (fail-loud, matching sanitize).
 */
async function resolveSteerFiles(
  files: Partial<TFile>[],
  user: SteerRequestUser,
  getFiles: SteerFileFetcher,
): Promise<ResolvedFilesResult> {
  const ids = collectFileIds(files);
  const filter = buildOwnerFilter(ids, user);
  if (filter == null) {
    return { error: 'INVALID_FILES' };
  }
  const docs = await getFiles(filter, {}, {});
  const docsById = new Map((docs ?? []).map((doc) => [doc.file_id, doc]));
  const resolved: Partial<TFile>[] = [];
  for (const id of ids) {
    const doc = docsById.get(id);
    const ref = doc == null ? null : toSteerFileRef(doc);
    if (ref == null) {
      return { error: 'INVALID_FILES' };
    }
    resolved.push(ref);
  }
  return { files: resolved, fileIds: ids };
}

/** Untenanted jobs (pre-multi-tenancy) remain accessible if the userId check passes. */
function hasTenantMismatch(
  metadata: { tenantId?: string } | undefined,
  user: SteerRequestUser,
): boolean {
  return metadata?.tenantId != null && metadata.tenantId !== user.tenantId;
}

/**
 * The full steer-request guard ladder, typed and host-agnostic: validation,
 * capability gate, job ownership/state checks, and the status-guarded enqueue.
 * Returns the HTTP status + JSON body for the thin `/api` route wrapper.
 * Rejection codes tell the client how to degrade:
 * - 404 NO_ACTIVE_RUN → send as a normal message
 * - 409 RUN_PAUSED    → run awaits human review; queue client-side instead
 * - 429 STEER_QUEUE_FULL → too many undrained steers
 * - 501 STEER_UNSUPPORTED → SDK cannot inject; queue client-side
 */
export async function handleSteerRequest(
  user: SteerRequestUser,
  body: SteerRequestBody,
  deps: SteerRequestDeps = {},
): Promise<SteerRequestResult> {
  const conversationId = body.conversationId;
  if (typeof conversationId !== 'string' || !conversationId || conversationId === 'new') {
    return { status: 400, body: { code: 'INVALID_CONVERSATION' } };
  }

  if (typeof body.text !== 'string') {
    return { status: 400, body: { code: 'EMPTY_TEXT' } };
  }
  const text = body.text.replace(/\0/g, '').trim();
  if (text.length === 0) {
    return { status: 400, body: { code: 'EMPTY_TEXT' } };
  }
  const maxLength = getSteerMaxLength();
  if (text.length > maxLength) {
    return { status: 413, body: { code: 'STEER_TOO_LONG', maxLength } };
  }

  const { files, error: filesError } = sanitizeSteerFiles(body.files);
  if (filesError) {
    return { status: 400, body: { code: filesError } };
  }

  /** streamId === conversationId for resumable agent jobs */
  const streamId = conversationId;
  const job = await GenerationJobManager.getJob(streamId);
  if (!job || job.status === 'complete' || job.status === 'error' || job.status === 'aborted') {
    return { status: 404, body: { code: 'NO_ACTIVE_RUN' } };
  }
  if (job.metadata?.userId && job.metadata.userId !== user.id) {
    logger.warn(`[handleSteerRequest] Unauthorized steer attempt for ${streamId} by ${user.id}`);
    return { status: 403, body: { code: 'UNAUTHORIZED' } };
  }
  if (hasTenantMismatch(job.metadata, user)) {
    return { status: 403, body: { code: 'UNAUTHORIZED' } };
  }

  /** A steer is model-bound instruction text for the ORIGINATING agent, so it
   *  must clear the same role/ACL gates the chat path runs — revoked access
   *  mid-run must not keep injecting. */
  if (deps.checkAgentAccess) {
    const allowed = await deps.checkAgentAccess({
      agentId: job.metadata?.agent_id,
      endpoint: job.metadata?.endpoint,
    });
    if (!allowed) {
      logger.warn(`[handleSteerRequest] Agent access denied for ${streamId} by ${user.id}`);
      return { status: 403, body: { code: 'FORBIDDEN' } };
    }
  }

  if (job.status === 'requires_action') {
    return { status: 409, body: { code: 'RUN_PAUSED' } };
  }

  /** AFTER the job checks: a steer racing run completion must get 404 (the
   *  client sends immediately) — a 501 here would queue it client-side with
   *  no remaining run-end signal to ever drain it. */
  if (!isSteeringSupported()) {
    return { status: 501, body: { code: 'STEER_UNSUPPORTED' } };
  }

  let queuedFiles = files;
  let resolvedFileIds: string[] | undefined;
  if (files && deps.getFiles) {
    const resolved = await resolveSteerFiles(files, user, deps.getFiles);
    if (resolved.error) {
      return { status: 400, body: { code: resolved.error } };
    }
    queuedFiles = resolved.files;
    resolvedFileIds = resolved.fileIds;
  }

  const item = {
    steerId: randomUUID(),
    text,
    userId: user.id ?? '',
    createdAt: Date.now(),
    ...(queuedFiles && { files: queuedFiles }),
  };
  const depth = await GenerationJobManager.steering.enqueue(streamId, item);
  if (depth === STEER_ENQUEUE_NOT_RUNNING) {
    return { status: 404, body: { code: 'NO_ACTIVE_RUN' } };
  }
  if (depth === STEER_ENQUEUE_QUEUE_FULL) {
    return { status: 429, body: { code: 'STEER_QUEUE_FULL' } };
  }

  /** Fire-and-forget: the persisted steer part references these uploads, so
   *  mark them used (parity with `updateFilesUsage` on normal sends) or the
   *  upload-window TTL could reap them before replay. Must not fail the 202. */
  if (resolvedFileIds?.length && deps.updateFilesUsage) {
    deps
      .updateFilesUsage(
        resolvedFileIds.map((file_id) => ({ file_id })),
        undefined,
        { user: user.id, tenantId: user.tenantId },
      )
      .catch((error) =>
        logger.warn(`[handleSteerRequest] Failed to mark steer files used: ${streamId}`, error),
      );
  }

  return {
    status: 202,
    body: { status: 'queued', steerId: item.steerId, position: depth, conversationId },
  };
}

/**
 * Cancel a queued steer before injection. `removed: false` is advisory, not
 * an error (200): the cancel lost its race — the steer already injected (the
 * inline part is authoritative) or the run reached a terminal path that owns
 * delivery — and the client should defer to the events it will receive. A
 * missing job reads the same way: nothing is left to cancel from.
 *
 * No `checkAgentAccess` dep here: a cancel injects nothing model-bound, so
 * job ownership/tenant checks suffice.
 */
export async function handleSteerCancel(
  user: SteerRequestUser,
  body: SteerCancelBody,
): Promise<SteerRequestResult> {
  const conversationId = body.conversationId;
  if (typeof conversationId !== 'string' || !conversationId || conversationId === 'new') {
    return { status: 400, body: { code: 'INVALID_CONVERSATION' } };
  }
  if (typeof body.steerId !== 'string' || body.steerId.length === 0) {
    return { status: 400, body: { code: 'INVALID_STEER_ID' } };
  }

  const streamId = conversationId;
  const job = await GenerationJobManager.getJob(streamId);
  if (!job) {
    return { status: 200, body: { removed: false } };
  }
  if (job.metadata?.userId && job.metadata.userId !== user.id) {
    logger.warn(`[handleSteerCancel] Unauthorized cancel attempt for ${streamId} by ${user.id}`);
    return { status: 403, body: { code: 'UNAUTHORIZED' } };
  }
  if (hasTenantMismatch(job.metadata, user)) {
    return { status: 403, body: { code: 'UNAUTHORIZED' } };
  }

  const removed = await GenerationJobManager.steering.cancel(streamId, body.steerId);
  return { status: 200, body: { removed } };
}
