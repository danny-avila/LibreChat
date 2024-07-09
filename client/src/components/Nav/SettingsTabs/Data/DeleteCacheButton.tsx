import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useOnClickOutside } from '~/hooks';
import DangerButton from '../DangerButton';

export const DeleteCacheButton = ({
  showText = true,
  disabled = false,
}: {
  showText?: boolean;
  disabled?: boolean;
}) => {
  const [confirmClear, setConfirmClear] = useState(false);
  const [isCacheEmpty, setIsCacheEmpty] = useState(true);
  const contentRef = useRef(null);
  useOnClickOutside(contentRef, () => confirmClear && setConfirmClear(false), []);

  const checkCache = useCallback(async () => {
    const cache = await caches.open('tts-responses');
    const keys = await cache.keys();
    setIsCacheEmpty(keys.length === 0);
  }, []);

  useEffect(() => {
    checkCache();
  }, [confirmClear]);

  const revokeAllUserKeys = useCallback(async () => {
    if (confirmClear) {
      const cache = await caches.open('tts-responses');
      await cache.keys().then((keys) => Promise.all(keys.map((key) => cache.delete(key))));

      setConfirmClear(false);
    } else {
      setConfirmClear(true);
    }
  }, [confirmClear]);

  return (
    <DangerButton
      ref={contentRef}
      showText={showText}
      onClick={revokeAllUserKeys}
      disabled={disabled || isCacheEmpty}
      confirmClear={confirmClear}
      id={'delete-cache'}
      actionTextCode={'com_ui_delete'}
      infoTextCode={'com_nav_delete_cache_storage'}
      infoDescriptionCode={'com_nav_info_delete_cache_storage'}
      dataTestIdInitial={'delete-cache-initial'}
      dataTestIdConfirm={'delete-cache-confirm'}
    />
  );
};
