import { atom } from 'recoil';

const text = atom({
  key: 'text',
  default: ''
});

export default text;
