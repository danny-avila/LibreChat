import { useRecoilValue } from 'recoil';
import type { TMessage } from 'librechat-data-provider';
import store from '~/store';

/**
 * Hook to get the timestamp for a message.
 * Returns the message's createdAt field if it exists (backend data takes priority),
 * otherwise returns the locked timestamp from Recoil.
 * This ensures that once a timestamp is set for a message during streaming,
 * it won't change even if the component rerenders frequently.
 */
export const useMessageTimestamp = (messageId: string, message?: TMessage): string | null => {
  const lockedTimestamp = useRecoilValue(store.messageTimestampState(messageId));
  
  // Backend data takes priority - use createdAt if available
  if (message?.createdAt) {
    return message.createdAt;
  }
  
  // Otherwise return the locked timestamp from Recoil
  return lockedTimestamp;
};
