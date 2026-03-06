import { useRecoilCallback } from 'recoil';
import type { TConversation } from 'librechat-data-provider';
import store from '~/store';

export default function useGetConversation(index: string | number = 0) {
  return useRecoilCallback(
    ({ snapshot }) =>
      () =>
        snapshot
          .getLoadable(store.conversationByKeySelector(index))
          .getValue() as TConversation | null,
    [index],
  );
}
