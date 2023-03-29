import { atom } from 'recoil';

const user = atom({
  key: 'user',
  default: null
});

export default {
  user
};
