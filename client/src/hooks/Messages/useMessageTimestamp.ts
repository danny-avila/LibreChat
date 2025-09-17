import { useRecoilValue } from 'recoil';
import type { TMessage } from 'librechat-data-provider';
import store from '~/store';

const useMessageTimestamp = (messageId: string, message?: TMessage): string | null => {
  const lockedTimestamp = useRecoilValue(store.messageTimestampState(messageId));

  // prioritize backend data if available
  if (message?.createdAt) {
    return message.createdAt;
  }

  return lockedTimestamp;
};

export default useMessageTimestamp;
