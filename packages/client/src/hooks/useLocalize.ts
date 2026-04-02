import { TOptions } from 'i18next';
import { useTranslation } from 'react-i18next';
import { resources } from '~/locales/i18n';

export type TranslationKeys = keyof typeof resources.en.translation;

export default function useLocalize() {
  const { t } = useTranslation();

  return (phraseKey: TranslationKeys, options?: TOptions) => t(phraseKey, options);
}
