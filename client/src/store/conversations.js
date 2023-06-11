import { atom, useSetRecoilState } from 'recoil';
import { useCallback } from 'react';

const refreshConversationsHint = atom({
  key: 'refreshConversationsHint',
  default: 1
});

const useConversations = () => {
  const setRefreshConversationsHint = useSetRecoilState(refreshConversationsHint);

  const refreshConversations = useCallback(() => {
    setRefreshConversationsHint((prevState) => prevState + 1);
  }, [setRefreshConversationsHint]);

  return { refreshConversations };
};

export default { refreshConversationsHint, useConversations };
