import { atom } from 'recoil';
import Cookies from 'js-cookie';

const userLang = navigator.language || navigator.languages[0];

const lang = atom({
  key: 'lang',
  default: Cookies.get('langcode') || userLang,
});

export default { lang };
