import { logger } from '@librechat/data-schemas';
import type { AppConfig } from '@librechat/data-schemas';

/**
 * Warns about delivery-path overrides that keep a file off the model path. Routing a type
 * to `none` is a legitimate choice, but a silent one: uploads still succeed and only a
 * file tool can reach them, so an operator who set it by accident has nothing to notice.
 */
export function warnOnUnreachableDeliveryPaths(appConfig?: AppConfig): void {
  const warnForOverrides = (
    overrides: Record<string, string> | undefined,
    scope?: string,
  ): void => {
    if (!overrides) {
      return;
    }
    for (const [mimeType, destination] of Object.entries(overrides)) {
      if (destination !== 'none') {
        continue;
      }
      const where = scope ? ` for "${scope}"` : '';
      logger.warn(
        `[Config] defaultLLMDeliveryPath${where}: "${mimeType}" is set to "none" — files of this type will only be accessible through tool provisioning`,
      );
    }
  };

  warnForOverrides(appConfig?.fileConfig?.defaultLLMDeliveryPath?.overrides);

  const endpoints = appConfig?.fileConfig?.endpoints;
  if (!endpoints) {
    return;
  }
  for (const [endpoint, config] of Object.entries(endpoints)) {
    warnForOverrides(config?.defaultLLMDeliveryPath?.overrides, endpoint);
  }
}
