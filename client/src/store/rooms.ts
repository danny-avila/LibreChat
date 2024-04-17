import { TUser } from 'librechat-data-provider';
import { atom } from 'recoil';

const refreshRoomHint = atom<number>({
  key: 'refreshRoomHint',
  default: 1,
});

const usersInRoom = atom<TUser[]>({
  key: 'users',
  default: [],
});

export default { refreshRoomHint, usersInRoom };
