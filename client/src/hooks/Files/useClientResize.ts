import { DEFAULT_MIN_FILE_SIZE_KB, mergeFileConfig } from 'librechat-data-provider';
import { useCallback, useMemo } from 'react';
import { useGetFileConfig } from '~/data-provider';
import {
  resizeImage,
  shouldResizeImage,
  supportsClientResize,
  type ResizeOptions,
  type ResizeResult,
} from '~/utils/imageResize';

const DEFAULT_CLIENT_IMAGE_RESIZE = {
  enabled: false,
  maxWidth: 1900,
  maxHeight: 1900,
  quality: 0.92,
  minFileSizeKB: DEFAULT_MIN_FILE_SIZE_KB,
} as const;

/**
 * Hook for client-side image resizing functionality
 * Integrates with LibreChat's file configuration system
 */
export const useClientResize = () => {
  const { data: fileConfig = null } = useGetFileConfig({
    select: (data) => mergeFileConfig(data),
  });

  const config = useMemo(
    () => fileConfig?.clientImageResize ?? DEFAULT_CLIENT_IMAGE_RESIZE,
    [fileConfig],
  );
  const isEnabled = config.enabled ?? false;
  const minFileSizeBytes = (config.minFileSizeKB ?? DEFAULT_MIN_FILE_SIZE_KB) * 1024;

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

      // Skip when the file is too small, not an image, or a GIF
      if (!shouldResizeImage(file, minFileSizeBytes)) {
        return { file, resized: false };
      }

      try {
        const resizeOptions: Partial<ResizeOptions> = {
          maxWidth: config.maxWidth,
          maxHeight: config.maxHeight,
          quality: config.quality,
          ...options,
        };

        const result = await resizeImage(file, resizeOptions);
        return { file: result.file, resized: true, result };
      } catch (error) {
        console.warn('Client-side image resizing failed:', error);
        return { file, resized: false };
      }
    },
    [isEnabled, config, minFileSizeBytes],
  );

  return {
    isEnabled,
    isSupported: supportsClientResize(),
    config,
    resizeImageIfNeeded,
  };
};

export default useClientResize;
