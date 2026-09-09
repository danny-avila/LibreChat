import { useEffect } from 'react';
import Cookies from 'js-cookie';
import { useAtomValue, useSetAtom } from 'jotai';
import i18n, { changeLanguageSafely, normalizeLocale } from '~/locales/i18n';
import { useGetStartupConfig } from '~/data-provider';
import store from '~/store';

/**
 * Applies `interface.defaultLanguage` for users who have not chosen a language
 * themselves — no `lang` cookie and no stored `lang`. This lets a deployment
 * default new users to a language regardless of the browser. An explicit user
 * choice always wins; the server default only replaces the browser fallback,
 * and it is stored on first apply so a later change to the server default does
 * not override a user who kept it.
 *
 * `'auto'` is skipped: it means "follow the browser", which is already the
 * default behavior. Applying it would run the browser language through
 * `normalizeLocale` and persist that concrete value, freezing it into
 * localStorage and stopping the app from tracking later browser changes.
 */
function useDefaultLanguage() {
  const { data: startupConfig } = useGetStartupConfig();
  const setLang = useSetAtom(store.lang);

  useEffect(() => {
    const serverDefault = startupConfig?.interface?.defaultLanguage;
    if (!serverDefault || serverDefault === 'auto') {
      return;
    }
    const userChoseLanguage = !!Cookies.get('lang') || localStorage.getItem('lang') !== null;
    if (userChoseLanguage) {
      return;
    }
    // Store the selector-conform value as-is (e.g. 'de-DE'), like the language
    // selector does. Normalization stays at the i18n boundary (the effect below,
    // via normalizeLocale/changeLanguageSafely) — persisting a normalized 'de'
    // would diverge from what the selector writes for the same language.
    setLang(serverDefault);
  }, [startupConfig, setLang]);
}

export default function LanguageSync() {
  const lang = useAtomValue(store.lang);
  const setLanguageLoading = useSetAtom(store.languageLoading);
  useDefaultLanguage();

  useEffect(() => {
    if (i18n.language === normalizeLocale(lang)) {
      setLanguageLoading(false);
      return;
    }

    let isCurrentRequest = true;
    setLanguageLoading(true);

    changeLanguageSafely(lang)
      .catch((error) => {
        console.error('[i18n] Failed to change language', error);
      })
      .finally(() => {
        if (isCurrentRequest) {
          setLanguageLoading(false);
        }
      });

    return () => {
      isCurrentRequest = false;
    };
  }, [lang, setLanguageLoading]);

  return null;
}
