import Cookies from 'js-cookie';
import { atom } from 'jotai';
import { createStorageAtom } from './jotai-utils';

const readStoredLang = () => {
  if (typeof localStorage === 'undefined') {
    return undefined;
  }

  const storedLang = localStorage.getItem('lang');
  if (!storedLang) {
    return undefined;
  }

  try {
    const parsedLang = JSON.parse(storedLang);
    return typeof parsedLang === 'string' ? parsedLang : storedLang;
  } catch {
    return storedLang;
  }
};

const defaultLang = () => {
  const userLang =
    (typeof navigator !== 'undefined' ? navigator.language || navigator.languages?.[0] : null) ??
    'en';
  return Cookies.get('lang') || readStoredLang() || userLang;
};

/**
 * Language state — owned by the i18n feature, so migrated to Jotai as a unit
 * (see AGENTS.md/CLAUDE.md Recoil→Jotai policy). `createStorageAtom` persists to
 * the `lang` localStorage key with JSON serialization, matching the previous
 * Recoil `atomWithLocalStorage` on-disk format, so existing saved values load
 * unchanged. Values are stored selector-conform (e.g. 'de-DE'); normalization
 * stays at the i18n boundary.
 */
const lang = createStorageAtom<string>('lang', defaultLang());
const languageLoading = atom<boolean>(false);

export default { lang, languageLoading };
