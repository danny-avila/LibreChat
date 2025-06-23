import React from 'react';
import { Bot } from 'lucide-react';
import type t from 'librechat-data-provider';

/**
 * Extracts the avatar URL from an agent's avatar property
 * Handles both string and object formats
 */
export const getAgentAvatarUrl = (agent: t.Agent | null | undefined): string | null => {
  if (!agent?.avatar) {
    return null;
  }

  if (typeof agent.avatar === 'string') {
    return agent.avatar;
  }

  if (agent.avatar && typeof agent.avatar === 'object' && 'filepath' in agent.avatar) {
    return agent.avatar.filepath;
  }

  return null;
};

/**
 * Renders an agent avatar with fallback to Bot icon
 * Consistent across all agent displays
 */
export const renderAgentAvatar = (
  agent: t.Agent | null | undefined,
  options: {
    size?: 'sm' | 'md' | 'lg' | 'xl';
    className?: string;
    showBorder?: boolean;
  } = {},
): React.ReactElement => {
  const { size = 'md', className = '', showBorder = true } = options;

  const avatarUrl = getAgentAvatarUrl(agent);

  // Size mappings for responsive design
  const sizeClasses = {
    sm: 'h-12 w-12 sm:h-14 sm:w-14',
    md: 'h-16 w-16 sm:h-20 sm:w-20 md:h-24 md:w-24',
    lg: 'h-20 w-20 sm:h-24 sm:w-24 md:h-28 md:w-28',
    xl: 'h-24 w-24',
  };

  const iconSizeClasses = {
    sm: 'h-6 w-6 sm:h-7 sm:w-7',
    md: 'h-6 w-6 sm:h-8 sm:w-8 md:h-10 md:w-10',
    lg: 'h-8 w-8 sm:h-10 sm:w-10 md:h-12 md:w-12',
    xl: 'h-10 w-10',
  };

  const placeholderSizeClasses = {
    sm: 'h-10 w-10 sm:h-12 sm:w-12',
    md: 'h-12 w-12 sm:h-16 sm:w-16 md:h-20 md:w-20',
    lg: 'h-16 w-16 sm:h-20 sm:w-20 md:h-24 md:w-24',
    xl: 'h-20 w-20',
  };

  const borderClasses = showBorder ? 'border-2 border-white dark:border-gray-800' : '';

  if (avatarUrl) {
    return (
      <div className={`flex items-center justify-center ${sizeClasses[size]} ${className}`}>
        <img
          src={avatarUrl}
          alt={`${agent?.name || 'Agent'} avatar`}
          className={`${sizeClasses[size]} rounded-full object-cover shadow-lg ${borderClasses}`}
          loading="lazy"
        />
      </div>
    );
  }

  // Fallback placeholder with Bot icon
  return (
    <div className={`relative flex items-center justify-center ${sizeClasses[size]} ${className}`}>
      {/* Subtle minimalistic placeholder */}
      <div className="absolute inset-0 rounded-full border border-gray-300 bg-gray-200 dark:border-gray-600 dark:bg-gray-700"></div>
      <div
        className={`relative flex items-center justify-center rounded-full bg-gray-300 dark:bg-gray-600 ${placeholderSizeClasses[size]}`}
      >
        <Bot
          className={`text-gray-500 dark:text-gray-400 ${iconSizeClasses[size]}`}
          strokeWidth={1.5}
        />
      </div>
    </div>
  );
};

/**
 * Gets the display name for a contact (prioritizes name over email)
 */
export const getContactDisplayName = (agent: t.Agent | null | undefined): string | null => {
  if (!agent) return null;

  const supportName = (agent as any).support_contact?.name;
  const supportEmail = (agent as any).support_contact?.email;
  const authorName = (agent as any).authorName;

  return supportName || authorName || supportEmail || null;
};

// All hardcoded category constants removed - now using database-driven categories
