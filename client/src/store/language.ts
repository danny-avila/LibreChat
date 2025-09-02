import Cookies from 'js-cookie';
import { atomWithLocalStorage } from './utils';

const defaultLang = () => {
  const userLang = navigator.language || navigator.languages[0];
  return Cookies.get('lang') || localStorage.getItem('lang') || userLang;
};

const lang = atomWithLocalStorage('lang', defaultLang());

export default { lang };
