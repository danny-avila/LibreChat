/**
 * Module-level cache for local blob preview URLs keyed by file_id.
 * Survives message replacements from SSE but clears on page refresh.
 */
const previewCache = new Map<string, string>();

export function cachePreview(fileId: string, previewUrl: string): void {
  previewCache.set(fileId, previewUrl);
}

export function getCachedPreview(fileId: string): string | undefined {
  return previewCache.get(fileId);
}
