import { atom } from 'recoil';

const lang = atom({
  key: 'lang',
  default: 'cn'
});

export default { lang };