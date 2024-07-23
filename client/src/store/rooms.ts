// import { TConversation } from 'librechat-data-provider';
import { atom } from 'recoil';

const refreshRoomHint = atom<number>({
  key: 'refreshRoomHint',
  default: 1,
});

const usersInRoom = atom<any>({
  key: 'users',
  default: [],
});

export default { refreshRoomHint, usersInRoom };
