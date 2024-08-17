import { memo } from 'react';

const PlaceholderRow = memo(({ isCard }: { isCard?: boolean }) => {
  if (!isCard) {
    return null;
  }
  return <div className="mt-1 h-[27px] bg-transparent" />;
});

export default PlaceholderRow;
