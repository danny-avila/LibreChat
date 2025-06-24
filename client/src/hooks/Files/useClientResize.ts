import { mergeFileConfig } from 'librechat-data-provider';
import { useCallback } from 'react';
import { useGetFileConfig } from '~/data-provider';
import {
  resizeImage,
  shouldResizeImage,
  supportsClientResize,
  type ResizeOptions,
  type ResizeResult,
} from '~/utils/imageResize';

/**
 * Hook for client-side image resizing functionality
 * Integrates with LibreChat's file configuration system
 */
export const useClientResize = () => {
  const { data: fileConfig = null } = useGetFileConfig({
    select: (data) => mergeFileConfig(data),
  });

  // Safe access to clientImageResize config with fallbacks
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const config = (fileConfig as any)?.clientImageResize ?? {
    enabled: false,
    maxWidth: 1900,
    maxHeight: 1900,
    quality: 0.92,
  };
  const isEnabled = config?.enabled ?? false;

  /**
   * Resizes an image if client-side resizing is enabled and supported
   * @param file - The image file to resize
   * @param options - Optional resize options to override defaults
   * @returns Promise resolving to either the resized file result or original file
   */
  const resizeImageIfNeeded = useCallback(
    async (
      file: File,
      options?: Partial<ResizeOptions>,
    ): Promise<{ file: File; resized: boolean; result?: ResizeResult }> => {
      // Return original file if resizing is disabled
      if (!isEnabled) {
        return { file, resized: false };
      }

      // Return original file if browser doesn't support resizing
      if (!supportsClientResize()) {
        console.warn('Client-side image resizing not supported in this browser');
        return { file, resized: false };
      }

      // Return original file if it doesn't need resizing
      if (!shouldResizeImage(file)) {
        return { file, resized: false };
      }

      try {
        const resizeOptions: Partial<ResizeOptions> = {
          maxWidth: config?.maxWidth,
          maxHeight: config?.maxHeight,
          quality: config?.quality,
          ...options,
        };

        const result = await resizeImage(file, resizeOptions);
        return { file: result.file, resized: true, result };
      } catch (error) {
        console.warn('Client-side image resizing failed:', error);
        return { file, resized: false };
      }
    },
    [isEnabled, config],
  );

  return {
    isEnabled,
    isSupported: supportsClientResize(),
    config,
    resizeImageIfNeeded,
  };
};

export default useClientResize;
