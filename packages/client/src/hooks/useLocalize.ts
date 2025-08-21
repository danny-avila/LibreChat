import { useEffect } from 'react';
import { TOptions } from 'i18next';
import { useAtomValue } from 'jotai';
import { useTranslation } from 'react-i18next';
import { resources } from '~/locales/i18n';
import { langAtom } from '~/store';

export type TranslationKeys = keyof typeof resources.en.translation;

export default function useLocalize() {
  const lang = useAtomValue(langAtom);
  const { t, i18n } = useTranslation();

  useEffect(() => {
    if (i18n.language !== lang) {
      i18n.changeLanguage(lang);
    }
  }, [lang, i18n]);

  return (phraseKey: TranslationKeys, options?: TOptions) => t(phraseKey, options);
}
