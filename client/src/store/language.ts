import Cookies from 'js-cookie';
import { atomWithLocalStorage } from './utils';

const defaultLang = () => {
  const userLang = navigator.language || navigator.languages[0];
  const envDefaultLang = import.meta.env.VITE_DEFAULT_LANGUAGE;
  return Cookies.get('lang') || localStorage.getItem('lang') || envDefaultLang || userLang;
};

const lang = atomWithLocalStorage('lang', defaultLang());

export default { lang };
