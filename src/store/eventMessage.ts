import { atom } from 'recoil';

const eventMessage = atom<string>({
  key: 'eventMessage',
  default: '',
});

export default { eventMessage };
