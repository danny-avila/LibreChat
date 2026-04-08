import { useCallback } from 'react';
import { TOptions } from 'i18next';
import { useTranslation } from 'react-i18next';
import { resources } from '~/locales/i18n';

export type TranslationKeys = keyof typeof resources.en.translation;

/** Language lifecycle is managed by the host app — do not add i18n.changeLanguage() calls here. */
export default function useLocalize() {
  const { t } = useTranslation();

  return useCallback(
    (phraseKey: TranslationKeys, options?: TOptions) => t(phraseKey, options),
    [t],
  );
}
