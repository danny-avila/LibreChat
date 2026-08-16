import { useCallback } from 'react';
import { useRecoilValue } from 'recoil';
import { mergeFileConfig } from 'librechat-data-provider';
import type { FileConfig } from 'librechat-data-provider';
import type { ResizeOptions, ResizeResult } from '~/utils/imageResize';
import { resizeImage, shouldResizeImage, supportsClientResize } from '~/utils/imageResize';
import { useGetFileConfig } from '~/data-provider';
import store from '~/store';

type ClientImageResizeConfig = NonNullable<FileConfig['clientImageResize']>;

const defaultConfig: ClientImageResizeConfig = {
  enabled: false,
  maxWidth: 1900,
  maxHeight: 1900,
  quality: 0.92,
  enforced: false,
};

/**
 * Hook for client-side image resizing functionality
 *
 * Resolution order is admin config, then user setting, then off: when
 * `clientImageResize.enabled` is set in `librechat.yaml` it is reported as
 * `enforced` and the user's setting is ignored.
 */
export const useClientResize = () => {
  const userPreference = useRecoilValue(store.clientImageResize);
  const { data: fileConfig = null, isSuccess: isFileConfigLoaded } = useGetFileConfig({
    select: (data) => mergeFileConfig(data),
  });

  const config = fileConfig?.clientImageResize ?? defaultConfig;
  const { maxWidth, maxHeight, quality } = config;
  const isEnforced = config.enforced === true;
  const isEnabled = isFileConfigLoaded && (isEnforced ? config.enabled === true : userPreference);

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
          maxWidth,
          maxHeight,
          quality,
          ...options,
        };

        const result = await resizeImage(file, resizeOptions);
        return { file: result.file, resized: result.file !== file, result };
      } catch (error) {
        console.warn('Client-side image resizing failed:', error);
        return { file, resized: false };
      }
    },
    [isEnabled, maxWidth, maxHeight, quality],
  );

  return {
    isEnabled,
    isEnforced,
    isSupported: supportsClientResize(),
    config,
    resizeImageIfNeeded,
  };
};

export default useClientResize;
