import { atom } from 'recoil';

const audioId = atom<string | undefined>({
  key: 'audioId',
  default: undefined,
});

export default { audioId };
