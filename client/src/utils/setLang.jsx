import { useEffect } from 'react';
import { useRecoilState } from 'recoil';
import store from '~/store';

// Automatically saves last selected language to localStorage
export default function SetLanguage() {
  const [lang] = useRecoilState(store.lang);

  useEffect(() => {
    window.localStorage.setItem('lang', lang);
  }, [lang]);

  return null;
}