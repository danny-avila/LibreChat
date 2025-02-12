import { useEffect, useCallback } from 'react';
import { useRecoilValue } from 'recoil';
import { useTranslation } from 'react-i18next';
import { TOptions } from 'i18next';
import store from '~/store';
import { resources } from '~/locales/i18n';

export type TranslationKeys = keyof typeof resources.en.translation;

export default function useLocalize() {
  const lang = useRecoilValue(store.lang);
  const { t, i18n } = useTranslation();

  useEffect(() => {
    if (i18n.language !== lang) {
      i18n.changeLanguage(lang);
    }
  }, [lang, i18n]);

  const memoizedLocalize = useCallback(
    (phraseKey: TranslationKeys, options?: TOptions) => t(phraseKey, options),
    [t],
  );

  return memoizedLocalize;
}
