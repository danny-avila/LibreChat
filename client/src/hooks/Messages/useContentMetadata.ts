import { useMemo } from 'react';
import type { TMessage, TContentMetadata } from 'librechat-data-provider';

export type ContentMetadataResult = {
  /** Memoized Map of content index to metadata */
  contentMetadataMap: Map<number, TContentMetadata> | undefined;
  /** Whether the message has parallel content (content with groupId) */
  hasParallelContent: boolean;
};

/**
 * Hook to get content metadata from a message.
 * Returns a memoized contentMetadataMap (as a Map) and hasParallelContent boolean.
 * Optimized to compute both in a single pass.
 *
 * @param message - The message to extract content metadata from
 * @returns ContentMetadataResult with contentMetadataMap and hasParallelContent
 */
export default function useContentMetadata(
  message: TMessage | null | undefined,
): ContentMetadataResult {
  return useMemo(() => {
    const metadataObj = message?.contentMetadataMap;
    if (!metadataObj) {
      return { contentMetadataMap: undefined, hasParallelContent: false };
    }

    // Single pass: build Map and check for parallel content simultaneously
    const entries = Object.entries(metadataObj);
    if (entries.length === 0) {
      return { contentMetadataMap: undefined, hasParallelContent: false };
    }

    let hasParallelContent = false;
    const contentMetadataMap = new Map<number, TContentMetadata>();

    for (const [key, value] of entries) {
      contentMetadataMap.set(parseInt(key, 10), value);
      if (!hasParallelContent && value.groupId != null) {
        hasParallelContent = true;
      }
    }

    return { contentMetadataMap, hasParallelContent };
  }, [message?.contentMetadataMap]);
}
