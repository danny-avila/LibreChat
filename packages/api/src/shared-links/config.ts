import type { AppConfig } from '@librechat/data-schemas';
import { isEnabled } from '~/utils';

/**
 * Whether shared links should snapshot the files referenced by the shared chat
 * snapshot. The `SHARED_LINKS_SNAPSHOT_FILES` env var overrides the yaml
 * `interface.sharedLinks.snapshotFiles` value; both default to enabled.
 */
export function isFileSnapshotEnabled(appConfig?: AppConfig): boolean {
  const envValue = process.env.SHARED_LINKS_SNAPSHOT_FILES;
  if (envValue !== undefined) {
    return isEnabled(envValue);
  }

  const sharedLinks = appConfig?.interfaceConfig?.sharedLinks;
  if (sharedLinks && typeof sharedLinks === 'object') {
    return sharedLinks.snapshotFiles !== false;
  }

  return true;
}
