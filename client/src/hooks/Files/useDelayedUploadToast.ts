import { useState } from 'react';
import { useToastContext } from '~/Providers/ToastContext';
import useLocalize from '~/hooks/useLocalize';

export const useDelayedUploadToast = () => {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const [uploadTimers, setUploadTimers] = useState({});

  const startUploadTimer = (fileId: string, fileName: string) => {
    const timer = setTimeout(() => {
      const message = localize('com_ui_upload_delay', fileName);
      showToast({
        message,
        status: 'warning',
        duration: 7000,
      });
    }, 3000); // 3 seconds delay

    setUploadTimers((prev) => ({ ...prev, [fileId]: timer }));
  };

  const clearUploadTimer = (fileId: string) => {
    if (uploadTimers[fileId]) {
      clearTimeout(uploadTimers[fileId]);
      setUploadTimers((prev) => {
        const { [fileId]: _, ...rest } = prev as Record<string, unknown>;
        return rest;
      });
    }
  };

  return { startUploadTimer, clearUploadTimer };
};
