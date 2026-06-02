import { memo } from 'react';
import { CustomMinimalIcon } from '@librechat/client';
import { cn } from '~/utils';

function UnknownIcon({
  className = '',
  iconURL = '',
}: {
  iconURL?: string;
  className?: string;
  endpoint?: string | null;
  context?: 'landing' | 'menu-item' | 'nav' | 'message';
}) {
  if (iconURL?.startsWith('http')) {
    return <img className={cn(className, 'object-contain')} src={iconURL} alt="" />;
  }

  return <CustomMinimalIcon className={className} />;
}

export default memo(UnknownIcon);
