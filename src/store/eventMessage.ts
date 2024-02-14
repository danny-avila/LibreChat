import { atom } from 'recoil';

const eventMessage = atom<string>({
  key: 'eventMessage',
  default: '',
});

const errorMessage = atom<string>({
  key: 'errorMessage',
  default: '',
});

export default { eventMessage, errorMessage };
