import React from 'react';
import { Users, User } from 'lucide-react';
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

  // Size variants
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

  // Avatar or icon logic
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
          {type === 'user' ? (
            <div
              className={cn(
                avatarSizeClass,
                'flex items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900',
              )}
            >
              <User className={cn(iconSizeClass, 'text-blue-600 dark:text-blue-400')} />
            </div>
          ) : (
            <div
              className={cn(
                avatarSizeClass,
                'flex items-center justify-center rounded-full bg-green-100 dark:bg-green-900',
              )}
            >
              <Users className={cn(iconSizeClass, 'text-green-600 dark:text-green-400')} />
            </div>
          )}
        </div>
      </div>
    );
  }

  // Fallback icon based on type
  return (
    <div className={cn('flex-shrink-0', className)}>
      {type === 'user' ? (
        <div
          className={cn(
            avatarSizeClass,
            'flex items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900',
          )}
        >
          <User className={cn(iconSizeClass, 'text-blue-600 dark:text-blue-400')} />
        </div>
      ) : (
        <div
          className={cn(
            avatarSizeClass,
            'flex items-center justify-center rounded-full bg-green-100 dark:bg-green-900',
          )}
        >
          <Users className={cn(iconSizeClass, 'text-green-600 dark:text-green-400')} />
        </div>
      )}
    </div>
  );
}
