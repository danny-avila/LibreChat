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
  iconSize?: 'sm' | 'md' | 'lg';
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
  iconSize = 'md',
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
    const iconSizeClasses = {
      sm: 'h-4 w-4',
      md: 'h-5 w-5',
      lg: 'h-6 w-6',
    };

    return (
      <div
        className={cn('flex items-center justify-center rounded-lg bg-surface-tertiary', className)}
      >
        <MCPIcon className={cn('text-text-secondary', iconSizeClasses[iconSize])} />
      </div>
    );
  }

  return defaultIcon;
}
