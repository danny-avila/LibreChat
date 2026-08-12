import type { TSharedLinkStartupConfig } from 'librechat-data-provider';
import type { AppConfig } from '@librechat/data-schemas';
import { isEnabled } from '~/utils';

type SharedLinkStartupEnv = NodeJS.ProcessEnv;

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

/**
 * Viewer-independent global kill switch for serving shared-link files. Reading
 * and serving must NOT depend on the viewer's resolved config (per-role/user
 * overrides) — only on the link's own stored choice plus this global env switch.
 * Active only when `SHARED_LINKS_SNAPSHOT_FILES` is explicitly set to a disabled
 * value; the creator's yaml choice is already captured per-link at share time.
 */
export function isFileSnapshotKillSwitchActive(): boolean {
  const envValue = process.env.SHARED_LINKS_SNAPSHOT_FILES;
  return envValue !== undefined && !isEnabled(envValue);
}

export function buildSharedLinkStartupPayload(
  appConfig?: AppConfig | null,
  env: SharedLinkStartupEnv = process.env,
): TSharedLinkStartupConfig {
  const payload: TSharedLinkStartupConfig = {
    appTitle: env.APP_TITLE || 'LibreChat',
  };

  if (typeof env.ANALYTICS_GTM_ID === 'string') {
    payload.analyticsGtmId = env.ANALYTICS_GTM_ID;
  }
  if (typeof env.SANDPACK_BUNDLER_URL === 'string') {
    payload.bundlerURL = env.SANDPACK_BUNDLER_URL;
  }
  if (typeof env.SANDPACK_STATIC_BUNDLER_URL === 'string') {
    payload.staticBundlerURL = env.SANDPACK_STATIC_BUNDLER_URL;
  }
  if (typeof env.CUSTOM_FOOTER === 'string') {
    payload.customFooter = env.CUSTOM_FOOTER;
  }

  const { privacyPolicy, termsOfService } = appConfig?.interfaceConfig ?? {};
  if (privacyPolicy || termsOfService) {
    payload.interface = {
      ...(privacyPolicy ? { privacyPolicy } : {}),
      ...(termsOfService ? { termsOfService } : {}),
    };
  }

  return payload;
}
