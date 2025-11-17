import React from 'react';
import { SystemRoles } from 'librechat-data-provider';
import { useAuthContext } from '~/hooks';

/**
 * Returns the HyperAI logo for regular users, or the original icon for admins
 */
export function useModelIcon(originalIcon: React.ReactNode): React.ReactNode {
  const { user } = useAuthContext();
  const isAdmin = user?.role === SystemRoles.ADMIN;

  if (isAdmin) {
    return originalIcon;
  }

  // For regular users, return HyperAI logo
  return (
    <img
      src="/assets/hyperai-logo.svg"
      alt="HyperAI"
      className="h-full w-full object-contain"
    />
  );
}

/**
 * Returns the HyperAI logo image element for regular users
 */
export function getHyperAILogo(size: number = 30): React.ReactNode {
  return (
    <img
      src="/assets/hyperai-logo.svg"
      alt="HyperAI"
      style={{ width: size, height: size }}
      className="object-contain"
    />
  );
}

