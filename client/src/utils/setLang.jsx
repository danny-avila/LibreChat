import { useEffect } from 'react';
import { useRecoilState } from 'recoil';
import store from '~/store';

export default function SetLanguage() {
  const [lang] = useRecoilState(store.lang);

  const languageCode =
    lang ||
    (navigator.languages.length > 1
      ? navigator.languages[0].startsWith('zh')
        ? 'zh-CN'
        : navigator.languages[0].substring(0, 2)
      : 'zh-CN');

  useEffect(() => {
    if (languageCode) {
      window.localStorage.setItem('lang', languageCode);
    }
  }, [lang, languageCode]);

  return null;
}
