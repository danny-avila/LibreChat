/**
 * Strips the query string from a stored `filepath` before it is resolved on disk.
 *
 * A regenerated code-interpreter output persists a cache-busting `?v=<timestamp>` suffix on its
 * file document's `filepath` (`processCodeOutput`), and shared-link cache validators fold that
 * field in on purpose (`buildShareFileEtag`), so the suffix cannot be dropped at write time.
 * Local storage is the only strategy that turns `filepath` into a filesystem path, so it is the
 * only one that has to remove the suffix before reading or deleting: remote strategies must keep
 * it, since their `filepath` is a URL whose query string can carry a presigned signature.
 *
 * Stripping is unambiguous here because `sanitizeFilename` replaces `?` with `_` in every stored
 * name, so no legitimate local path contains one.
 *
 * @param {string} filepath - The stored filepath, possibly suffixed with `?v=<timestamp>`.
 * @returns {string} The filepath without its query string.
 */
function stripCacheBust(filepath) {
  if (typeof filepath !== 'string') {
    return filepath;
  }

  const queryIndex = filepath.indexOf('?');
  return queryIndex === -1 ? filepath : filepath.slice(0, queryIndex);
}

module.exports = { stripCacheBust };
