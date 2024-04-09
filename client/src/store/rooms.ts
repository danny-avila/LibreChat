import { atom } from 'recoil';

const refreshRoomHint = atom<number>({
  key: 'refreshRoomHint',
  default: 1,
});

export default { refreshRoomHint };
