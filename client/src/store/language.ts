import Cookies from 'js-cookie';
import { atomWithStorage } from 'jotai/utils';

const defaultLang = () => {
  const userLang = navigator.language || navigator.languages[0];
  return Cookies.get('lang') || localStorage.getItem('lang') || userLang;
};

const lang = atomWithStorage('lang', defaultLang());

export default { lang };
