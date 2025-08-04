import React from 'react';
import { Users, User, Shield } from 'lucide-react';
import { PrincipalType } from 'librechat-data-provider';
import type { TPrincipal } from 'librechat-data-provider';
import { cn } from '~/utils';

interface PrincipalAvatarProps {
  principal: TPrincipal;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export default function PrincipalAvatar({
  principal,
  size = 'md',
  className,
}: PrincipalAvatarProps) {
  const { avatar, type, name } = principal;
  const displayName = name || 'Unknown';

  const sizeClasses = {
    sm: 'h-6 w-6',
    md: 'h-8 w-8',
    lg: 'h-10 w-10',
  };

  const iconSizeClasses = {
    sm: 'h-3 w-3',
    md: 'h-4 w-4',
    lg: 'h-5 w-5',
  };

  const avatarSizeClass = sizeClasses[size];
  const iconSizeClass = iconSizeClasses[size];

  /** Get icon component and styling based on type */
  const getIconConfig = () => {
    switch (type) {
      case PrincipalType.USER:
        return {
          Icon: User,
          containerClass: 'bg-blue-100 dark:bg-blue-900',
          iconClass: 'text-blue-600 dark:text-blue-400',
        };
      case PrincipalType.GROUP:
        return {
          Icon: Users,
          containerClass: 'bg-green-100 dark:bg-green-900',
          iconClass: 'text-green-600 dark:text-green-400',
        };
      case PrincipalType.ROLE:
        return {
          Icon: Shield,
          containerClass: 'bg-purple-100 dark:bg-purple-900',
          iconClass: 'text-purple-600 dark:text-purple-400',
        };
      default:
        return {
          Icon: User,
          containerClass: 'bg-surface-tertiary',
          iconClass: 'text-text-secondary',
        };
    }
  };

  const { Icon, containerClass, iconClass } = getIconConfig();

  if (avatar) {
    return (
      <div className={cn('flex-shrink-0', className)}>
        <img
          src={avatar}
          alt={`${displayName} avatar`}
          className={cn(avatarSizeClass, 'rounded-full object-cover')}
          onError={(e) => {
            // Fallback to icon if image fails to load
            const target = e.target as HTMLImageElement;
            target.style.display = 'none';
            target.nextElementSibling?.classList.remove('hidden');
          }}
        />
        {/* Hidden fallback icon that shows if image fails */}
        <div className={cn('hidden', avatarSizeClass)}>
          <div
            className={cn(
              avatarSizeClass,
              'flex items-center justify-center rounded-full',
              containerClass,
            )}
          >
            <Icon className={cn(iconSizeClass, iconClass)} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('flex-shrink-0', className)}>
      <div
        className={cn(
          avatarSizeClass,
          'flex items-center justify-center rounded-full',
          containerClass,
        )}
      >
        <Icon className={cn(iconSizeClass, iconClass)} />
      </div>
    </div>
  );
}
