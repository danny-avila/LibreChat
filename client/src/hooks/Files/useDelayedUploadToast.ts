import { useState } from 'react';
import { useToastContext } from '~/Providers/ToastContext';
import useLocalize from '~/hooks/useLocalize';

export const useDelayedUploadToast = () => {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const [uploadTimers, setUploadTimers] = useState<Record<string, NodeJS.Timeout>>({});

  const determineDelay = (fileSize: number): number => {
    const baseDelay = 5000;
    const additionalDelay = Math.floor(fileSize / 1000000) * 2000;
    return baseDelay + additionalDelay;
  };

  const startUploadTimer = (fileId: string, fileName: string, fileSize: number) => {
    const delay = determineDelay(fileSize);

    if (uploadTimers[fileId]) {
      clearTimeout(uploadTimers[fileId]);
    }

    const timer = setTimeout(() => {
      const message = localize('com_ui_upload_delay', fileName);
      showToast({
        message,
        status: 'warning',
        duration: 7000,
      });
    }, delay);

    setUploadTimers((prev) => ({ ...prev, [fileId]: timer }));
  };

  const clearUploadTimer = (fileId: string) => {
    if (uploadTimers[fileId]) {
      clearTimeout(uploadTimers[fileId]);
      setUploadTimers((prev) => {
        const { [fileId]: _, ...rest } = prev;
        return rest;
      });
    }
  };

  return { startUploadTimer, clearUploadTimer };
};
