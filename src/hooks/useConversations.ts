import { useSetRecoilState } from 'recoil';
import { useCallback } from 'react';
import store from '~/store';

const useConversations = () => {
  const setRefreshConversationsHint = useSetRecoilState(store.refreshConversationsHint);

  const refreshConversations = useCallback(() => {
    setRefreshConversationsHint((prevState) => prevState + 1);
  }, [setRefreshConversationsHint]);

  return { refreshConversations };
};

export default useConversations;
