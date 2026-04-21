import Cookies from 'js-cookie';
import { atom } from 'recoil';

const LANG_KEY = 'lang';
const DEFAULT_LANG = 'ko';

const readStoredLang = (): string | null => {
  const cookieLang = Cookies.get(LANG_KEY);
  if (cookieLang) {
    return cookieLang;
  }
  const raw = localStorage.getItem(LANG_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === 'string' ? parsed : null;
  } catch {
    return raw;
  }
};

/**
 * BKL defaults the UI to Korean. If the browser never had an explicit Korean
 * preference (i.e. stored value is missing or falls back to English), migrate
 * to 'ko'. Explicit non-English choices are preserved.
 */
const resolveInitialLang = (): string => {
  const stored = readStoredLang();
  if (stored && !stored.toLowerCase().startsWith('en')) {
    return stored;
  }
  return DEFAULT_LANG;
};

const lang = atom<string>({
  key: LANG_KEY,
  default: DEFAULT_LANG,
  effects_UNSTABLE: [
    ({ setSelf, onSet }) => {
      const initial = resolveInitialLang();
      setSelf(initial);
      localStorage.setItem(LANG_KEY, JSON.stringify(initial));

      onSet((newValue) => {
        if (typeof newValue === 'string') {
          localStorage.setItem(LANG_KEY, JSON.stringify(newValue));
        }
      });
    },
  ],
});

export default { lang };
