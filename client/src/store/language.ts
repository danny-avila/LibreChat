import Cookies from 'js-cookie';
import { atomWithLocalStorage } from './utils';

const defaultLang = () => Cookies.get('lang') || localStorage.getItem('lang') || 'en-US';

const lang = atomWithLocalStorage('lang', defaultLang());

export default { lang };
