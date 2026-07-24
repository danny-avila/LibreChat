import { memo } from 'react';
import { useRecoilValue } from 'recoil';
import store from '~/store';

type MessageTimestampProps = {
  createdAt?: string | Date;
};

const MessageTimestamp = memo(({ createdAt }: MessageTimestampProps) => {
  const lang = useRecoilValue(store.lang);

  if (!createdAt) {
    return null;
  }

  const date = new Date(createdAt);

  const formattedDate = date.toLocaleString(lang, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <span className="ml-auto flex items-center text-xs text-text-secondary">{formattedDate}</span>
  );
});

MessageTimestamp.displayName = 'MessageTimestamp';

export default MessageTimestamp;
