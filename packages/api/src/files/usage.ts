/** Cap per usage touch, mirroring the composer's practical attachment limit. */
export const FILES_USAGE_MAX_IDS: number = 10;

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
  /** Owner-scoped usage marker (`db.updateFilesUsage`-shaped). */
  updateFilesUsage: (
    files: Array<{ file_id: string }>,
    fileIds?: string[],
    options?: { user?: string; tenantId?: string | null },
  ) => Promise<unknown[]>;
}

/**
 * Owner-scoped usage touch for attachments entering a client-side queue: a
 * queued message can outlive the upload window (long run, approval pause), so
 * marking at queue time stops the TTL from reaping files the drain will send.
 * Best-effort 200 — ids that do not resolve to an owned file are not errors
 * (send-time marking remains the backstop).
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
  const files: Array<{ file_id: string }> = [];
  for (const value of raw) {
    if (typeof value !== 'string' || value.length === 0) {
      return { status: 400, body: { code: 'INVALID_FILE_IDS' } };
    }
    files.push({ file_id: value });
  }
  const marked = await deps.updateFilesUsage(files, undefined, {
    user: user.id,
    tenantId: user.tenantId,
  });
  return { status: 200, body: { marked: marked.length } };
}
