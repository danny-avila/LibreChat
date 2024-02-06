import { atom } from 'recoil';

const refreshConversationsHint = atom<number>({
  key: 'refreshConversationsHint',
  default: 1,
});

export default { refreshConversationsHint };
