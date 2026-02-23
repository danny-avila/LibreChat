import type { Agents } from 'librechat-data-provider';

/**
 * Checks if an image_url content item contains base64 data (not an HTTP URL).
 *
 * IMPORTANT: This function is duplicated in two locations:
 * 1. librechat/packages/api/src/utils/image-helpers.ts (for Assistants endpoint)
 * 2. agents/src/messages/core.ts (for Agents endpoint)
 *
 * Both implementations MUST remain identical. The agents package cannot import
 * from @librechat/api as it's a separate npm package.
 *
 * Base64 data URLs start with "data:" and can cause context overflow when
 * sent to non-vision models. HTTP URLs are just text references and don't
 * need filtering.
 *
 * @param item - Message content item to check
 * @returns true if the item is an image_url with base64 data, false otherwise
 */
export function isBase64ImageUrl(item: Agents.MessageContentComplex): boolean {
  if (item.type !== 'image_url') {
    return false;
  }

  const itemWithImageUrl = item as { image_url?: string | { url?: string } };
  const imageUrl = itemWithImageUrl.image_url;

  if (typeof imageUrl === 'string') {
    return imageUrl.startsWith('data:');
  }

  if (imageUrl && typeof imageUrl === 'object' && 'url' in imageUrl) {
    const url = imageUrl.url;
    return typeof url === 'string' && url.startsWith('data:');
  }

  return false;
}
