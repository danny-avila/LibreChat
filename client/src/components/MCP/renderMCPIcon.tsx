import type { ReactNode } from 'react';
import { MCPIcon } from '@librechat/client';
import ClickHouseIcon from './ClickHouseIcon';
import { cn } from '~/utils';

export interface RenderMCPIconOptions {
  iconPath?: string | null;
  serverName?: string;
  name?: string;
  displayName?: string;
  className?: string;
  alt?: string;
  fallbackIcon?: ReactNode;
  wrapDefault?: boolean;
}

export function renderMCPIcon({
  iconPath,
  serverName,
  name,
  displayName,
  className = 'h-8 w-8 rounded-lg object-cover',
  alt,
  fallbackIcon,
  wrapDefault = false,
}: RenderMCPIconOptions): ReactNode {
  const altText = alt || displayName || name || serverName || '';
  const isClickHouse = serverName?.toLowerCase().includes('clickhouse') ?? false;

  if (iconPath) {
    return <img src={iconPath} className={className} alt={altText} />;
  }

  if (isClickHouse) {
    return <ClickHouseIcon className={className} alt={altText} />;
  }

  if (fallbackIcon) {
    return fallbackIcon;
  }

  const defaultIcon = <MCPIcon className={cn('text-text-secondary', className)} />;

  if (wrapDefault) {
    return (
      <div
        className={cn('flex items-center justify-center rounded-lg bg-surface-tertiary', className)}
      >
        <MCPIcon
          className={cn(
            'h-5 w-5 text-text-secondary',
            className.includes('size-8') ? 'size-5' : '',
          )}
        />
      </div>
    );
  }

  return defaultIcon;
}
