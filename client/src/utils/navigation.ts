import { apiBaseUrl } from 'librechat-data-provider';

/**
 * Loads an app path as a new document under the deployment's base path. A full load discards
 * every in-memory query and store, which is the point when the session's organization changes.
 */
export function loadAppPath(path: string): void {
  window.location.assign(`${apiBaseUrl()}${path}`);
}
