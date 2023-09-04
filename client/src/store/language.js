import { atom } from 'recoil';

const localStorage = window.localStorage.getItem('lang'); // Get last seleceted language from localStorage

const lang = atom({
  key: 'lang',
  default: localStorage || 'en', // Fall back to English if localStorage is null
});

export default { lang };