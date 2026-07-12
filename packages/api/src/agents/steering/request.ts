import { randomUUID } from 'crypto';
import { logger } from '@librechat/data-schemas';
import type { TFile } from 'librechat-data-provider';
import { STEER_ENQUEUE_NOT_RUNNING, STEER_ENQUEUE_QUEUE_FULL } from '~/stream/interfaces/IJobStore';
import { GenerationJobManager } from '~/stream/GenerationJobManager';
import { isSteeringSupported } from './runtime';
import { toSteerFileRef } from './refs';

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

/** HTTP-shaped outcome the thin route wrapper serializes verbatim. */
export interface SteerRequestResult {
  status: number;
  body: Record<string, unknown>;
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
  if (job.status === 'requires_action') {
    return { status: 409, body: { code: 'RUN_PAUSED' } };
  }

  /** AFTER the job checks: a steer racing run completion must get 404 (the
   *  client sends immediately) — a 501 here would queue it client-side with
   *  no remaining run-end signal to ever drain it. */
  if (!isSteeringSupported()) {
    return { status: 501, body: { code: 'STEER_UNSUPPORTED' } };
  }

  const item = {
    steerId: randomUUID(),
    text,
    userId: user.id ?? '',
    createdAt: Date.now(),
    ...(files && { files }),
  };
  const depth = await GenerationJobManager.steering.enqueue(streamId, item);
  if (depth === STEER_ENQUEUE_NOT_RUNNING) {
    return { status: 404, body: { code: 'NO_ACTIVE_RUN' } };
  }
  if (depth === STEER_ENQUEUE_QUEUE_FULL) {
    return { status: 429, body: { code: 'STEER_QUEUE_FULL' } };
  }

  return {
    status: 202,
    body: { status: 'queued', steerId: item.steerId, position: depth, conversationId },
  };
}
