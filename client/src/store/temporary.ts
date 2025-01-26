import { atom } from 'recoil';

const isTemporary = atom<boolean>({
  key: 'isTemporary',
  default: false,
});

export default {
  isTemporary,
};
