import { useEffect } from 'react';
import Cookies from 'js-cookie';
import { useRecoilState } from 'recoil';
import { isRTLLanguage } from '~/utils/isRTLLanguage';
import { getSpeechLocale } from '~/utils/getSpeechLocale';
import store from '~/store';

/** Syncs the `chatDirection` Recoil state to `document.documentElement.dir`
 *  so all CSS `dir`-aware and Tailwind `rtl:` variants work automatically.
 *  Only applies direction + speech locale when the user has explicitly set a language. */
export default function DirectionManager() {
  const [chatDirection, setChatDirection] = useRecoilState(store.chatDirection);
  const [languageSTT, setLanguageSTT] = useRecoilState<string>(store.languageSTT);
  const [, setLanguageTTS] = useRecoilState<string>(store.languageTTS);

  useEffect(() => {
    // Only honour an explicit user choice — never auto-detect from navigator.language
    const storedLang = Cookies.get('lang') || localStorage.getItem('lang');
    if (!storedLang) {
      return;
    }
    document.documentElement.lang = storedLang;
    // Always sync direction to match stored language (handles RTL→LTR and LTR→RTL)
    const direction = isRTLLanguage(storedLang) ? 'RTL' : 'LTR';
    setChatDirection(direction);
    document.documentElement.dir = direction.toLowerCase();
    if (!languageSTT) {
      const locale = getSpeechLocale(storedLang);
      setLanguageSTT(locale);
      setLanguageTTS(locale);
    }
  // Only run once on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    document.documentElement.dir = chatDirection.toLowerCase();
  }, [chatDirection]);

  return null;
}
