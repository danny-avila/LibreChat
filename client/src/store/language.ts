import { atom } from 'recoil';

const lang = atom({
  key: 'lang',
  default: localStorage.getItem('lang') || 'en-US',
});

export default { lang };
