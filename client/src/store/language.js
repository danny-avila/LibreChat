import { atom } from 'recoil';

const localStorage = window.localStorage.getItem('lang'); // Get last seleceted language from localStorage

const lang = atom({
  key: 'lang',
  // If localStorage is null, defaults to Chinese if the domain is iAITok.com; English otherwise
  default: localStorage || 'cn',
});

export default { lang };