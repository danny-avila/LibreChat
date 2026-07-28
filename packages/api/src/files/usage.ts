/** Cap per usage touch, mirroring the composer's practical attachment limit. */
export const FILES_USAGE_MAX_IDS: number = 10;

/**
 * Total lifetime a held upload gets, measured from its upload time. Generous
 * enough to outlast any realistic queue wait (long run, approval pause),
 * short enough that a queue the user abandons still gets reaped.
 *
 * Measured from upload rather than from the request, so the deadline is a
 * fixed point per file: replaying the touch re-asserts the same instant
 * instead of walking the file's lifetime forward a window at a time.
 */
export const FILES_USAGE_HOLD_MS: number = 24 * 60 * 60 * 1000;

export interface FilesUsageUser {
  id?: string;
  tenantId?: string;
}

export interface FilesUsageBody {
  file_ids?: unknown;
}

/** HTTP-shaped outcome the thin route wrapper serializes verbatim. */
export interface FilesUsageResult {
  status: number;
  body: Record<string, unknown>;
}

export interface FilesUsageDeps {
  /** Owner-scoped TTL hold (`db.extendFilesTTL`-shaped). */
  extendFilesTTL: (
    fileIds: string[],
    holdMs: number,
    owner: { user: string; tenantId?: string | null },
  ) => Promise<number>;
}

/**
 * Owner-scoped TTL hold for attachments entering a client-side queue: a
 * queued message can outlive the upload window (long run, approval pause),
 * so holding at queue time stops the TTL from reaping files the drain will
 * send.
 *
 * A hold, not a release. The client queue is ephemeral browser state, so a
 * closed tab or a cleared queue leaves nothing referencing these files, and
 * clearing the TTL outright would strand them in storage permanently. The
 * hold only widens the window to a fixed point measured from upload, so it
 * is idempotent under replay; the real release happens at send, where
 * `updateFilesUsage` marks the files used against an actual message.
 *
 * Best-effort 200: ids that do not resolve to a held file are not errors
 * (they may be already-sent files, or not owned).
 */
export async function handleFilesUsageRequest(
  user: FilesUsageUser,
  body: FilesUsageBody,
  deps: FilesUsageDeps,
): Promise<FilesUsageResult> {
  if (!user.id) {
    return { status: 401, body: { code: 'UNAUTHORIZED' } };
  }
  const raw = body.file_ids;
  if (!Array.isArray(raw) || raw.length === 0) {
    return { status: 400, body: { code: 'INVALID_FILE_IDS' } };
  }
  if (raw.length > FILES_USAGE_MAX_IDS) {
    return { status: 400, body: { code: 'TOO_MANY_FILES', max: FILES_USAGE_MAX_IDS } };
  }
  const fileIds: string[] = [];
  for (const value of raw) {
    if (typeof value !== 'string' || value.length === 0) {
      return { status: 400, body: { code: 'INVALID_FILE_IDS' } };
    }
    fileIds.push(value);
  }
  const held = await deps.extendFilesTTL(fileIds, FILES_USAGE_HOLD_MS, {
    user: user.id,
    tenantId: user.tenantId,
  });
  return { status: 200, body: { held } };
}
