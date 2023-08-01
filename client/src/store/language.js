import { atom } from 'recoil';

const lang = atom({
  key: 'lang',
  default: 'en',
});

export default { lang };