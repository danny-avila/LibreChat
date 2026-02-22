import { atom } from 'recoil';

const text = atom<string>({
  key: 'text',
  default: '',
});

export default { text };
