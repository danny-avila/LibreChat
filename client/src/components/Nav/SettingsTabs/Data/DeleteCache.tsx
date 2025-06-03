import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Label, Button, OGDialog, OGDialogTrigger, Spinner } from '~/components';
import OGDialogTemplate from '~/components/ui/OGDialogTemplate';
import { useOnClickOutside, useLocalize } from '~/hooks';

export const DeleteCache = ({ disabled = false }: { disabled?: boolean }) => {
  const localize = useLocalize();
  const [open, setOpen] = useState(false);
  const [isCacheEmpty, setIsCacheEmpty] = useState(true);
  const [confirmClear, setConfirmClear] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const contentRef = useRef(null);
  useOnClickOutside(contentRef, () => confirmClear && setConfirmClear(false), []);

  const checkCache = useCallback(async () => {
    const cache = await caches.open('tts-responses');
    const keys = await cache.keys();
    setIsCacheEmpty(keys.length === 0);
  }, []);

  useEffect(() => {
    checkCache();
  }, [checkCache]);

  const revokeAllUserKeys = useCallback(async () => {
    setIsLoading(true);
    const cache = await caches.open('tts-responses');
    await cache.keys().then((keys) => Promise.all(keys.map((key) => cache.delete(key))));
    setIsLoading(false);
  }, []);

  return (
    <div className="flex items-center justify-between">
      <Label className="font-light">{localize('com_nav_delete_cache_storage')}</Label>
      <OGDialog open={open} onOpenChange={setOpen}>
        <OGDialogTrigger asChild>
          <Button
            variant="destructive"
            className="flex items-center justify-center rounded-lg transition-colors duration-200"
            onClick={() => setOpen(true)}
            disabled={disabled || isCacheEmpty}
          >
            {localize('com_ui_delete')}
          </Button>
        </OGDialogTrigger>
        <OGDialogTemplate
          showCloseButton={false}
          title={localize('com_nav_confirm_clear')}
          className="max-w-[450px]"
          main={
            <Label className="text-left text-sm font-medium">
              {localize('com_nav_clear_cache_confirm_message')}
            </Label>
          }
          selection={{
            selectHandler: revokeAllUserKeys,
            selectClasses:
              'bg-destructive text-white transition-all duration-200 hover:bg-destructive/80',
            selectText: isLoading ? <Spinner /> : localize('com_ui_delete'),
          }}
        />
      </OGDialog>
    </div>
  );
};
