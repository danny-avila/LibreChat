import type t from 'librechat-data-provider';

/**
 * Checks if an image is already cached in the browser
 * Returns true if image is complete and has valid dimensions
 */
export const isImageCached = (url: string | null | undefined): boolean => {
  if (typeof window === 'undefined' || !url) {
    return false;
  }
  const img = new Image();
  img.src = url;
  return img.complete && img.naturalWidth > 0;
};

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
 * Gets the display name for a contact (prioritizes name over email)
 */
export const getContactDisplayName = (agent: t.Agent | null | undefined): string | null => {
  if (!agent) return null;

  const supportName = (agent as any).support_contact?.name;
  const supportEmail = (agent as any).support_contact?.email;
  const authorName = (agent as any).authorName;

  return supportName || authorName || supportEmail || null;
};
