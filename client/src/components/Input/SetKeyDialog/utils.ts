import type { TOptions } from 'i18next';
import type { TranslationKeys } from '~/hooks';

type Localize = (phraseKey: TranslationKeys, options?: TOptions) => string;

export function formatKeyExpiryLabel(localize: Localize, expiry: string): string {
  const formattedExpiry = new Date(expiry).toLocaleString();
  const localizedLabel = localize('com_endpoint_config_key_encryption', {
    0: formattedExpiry,
  });

  return localizedLabel.includes(formattedExpiry)
    ? localizedLabel
    : `${localizedLabel} ${formattedExpiry}`;
}
