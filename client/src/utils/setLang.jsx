import { useSetRecoilState } from 'recoil';
import store from '~/store';

export default function SetLanguage() {
  const setLang = useSetRecoilState(store.lang);
  if (navigator.languages[0] === 'zh-CN') setLang('cn');

  return null;
}