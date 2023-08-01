import { useRecoilState } from 'recoil';
import store from '~/store';

export default function SetLanguage() {
  const [lang, setLang] = useRecoilState(store.lang); // eslint-disable-line
  if (navigator.languages[0] === 'zh-CN') setLang('cn');

  return null;
}