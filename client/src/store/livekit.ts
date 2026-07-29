import { atom } from 'recoil';

const isVideoCallActive = atom<boolean>({
  key: 'isVideoCallActive',
  default: false,
});

export default {
  isVideoCallActive,
};
