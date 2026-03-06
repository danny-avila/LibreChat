import { memo } from 'react';

const PlaceholderRow = memo(function PlaceholderRow() {
  return <div className="mt-1 h-[27px] bg-transparent" />;
});
PlaceholderRow.displayName = 'PlaceholderRow';

export default PlaceholderRow;
