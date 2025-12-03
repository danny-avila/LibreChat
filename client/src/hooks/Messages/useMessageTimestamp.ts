import { useAtomValue } from 'jotai';
import type { TMessage } from 'librechat-data-provider';
import { messageTimestampAtomFamily } from '~/store';

const useMessageTimestamp = (messageId: string, message?: TMessage): string | null => {
  const lockedTimestamp = useAtomValue(messageTimestampAtomFamily(messageId));

  if (message?.createdAt) {
    return message.createdAt;
  }

  return lockedTimestamp;
};

export default useMessageTimestamp;
