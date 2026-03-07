import Cookies from 'js-cookie';
import { atomWithLocalStorage } from './utils';

const defaultLang = () => {
  return Cookies.get('lang') || localStorage.getItem('lang') || 'pt-BR';
};

const lang = atomWithLocalStorage('lang', defaultLang());

export default { lang };
