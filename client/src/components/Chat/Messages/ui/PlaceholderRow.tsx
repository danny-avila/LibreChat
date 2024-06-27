import { memo } from 'react';

const PlaceholderRow = memo(({ isLast, isCard }: { isLast: boolean; isCard?: boolean }) => {
  if (!isCard) {
    return null;
  }
  if (!isLast) {
    return null;
  }
  return <div className="mt-1 h-[27px] bg-transparent" />;
});

export default PlaceholderRow;
