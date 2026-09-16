import { resolveMediaConfig } from 'librechat-data-provider';
import type { MediaConfig, MediaStartupConfig } from 'librechat-data-provider';

/** Project capability hints from already-loaded policy; never resolve keys or discover models. */
export function sanitizeMediaStartupConfig({
  config,
  authenticated,
  canUse,
  canCreate,
  reconciliationAvailable = false,
}: {
  config?: MediaConfig;
  authenticated: boolean;
  canUse: boolean;
  canCreate: boolean;
  reconciliationAvailable?: boolean;
}): MediaStartupConfig | undefined {
  if (!authenticated) {
    return undefined;
  }
  const resolved = config ?? resolveMediaConfig();
  const enabled = canUse && (resolved.enabled || reconciliationAvailable);
  return {
    enabled,
    studio: enabled && resolved.surfaces.studio,
    chat: enabled && resolved.surfaces.chat,
    canCreate: enabled && resolved.enabled && canCreate,
    clientPollIntervalMs: resolved.polling.clientIntervalMs,
    clientCatchUpIntervalMs: resolved.polling.clientCatchUpIntervalMs,
  };
}
