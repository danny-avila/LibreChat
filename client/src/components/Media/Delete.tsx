import { useRef, useState } from 'react';
import {
  Button,
  OGDialog,
  OGDialogContent,
  OGDialogTitle,
  OGDialogDescription,
  Spinner,
} from '@librechat/client';
import type { MediaThreadsDeleteRequest } from 'librechat-data-provider';
import type { MediaQueryScope } from '~/data-provider';
import { useDeleteMediaThreads } from '~/data-provider';
import { mediaErrorCode } from './commands';
import { mediaErrorLabels } from './labels';
import { useLocalize } from '~/hooks';

export function MediaDeleteDialog({
  host,
  request,
  open,
  onOpenChange,
  onDeleted,
}: {
  host: Pick<MediaQueryScope, 'scope' | 'isCurrentSession'>;
  request: MediaThreadsDeleteRequest;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted?: (failedIds: string[]) => void;
}) {
  const localize = useLocalize();
  const remove = useDeleteMediaThreads(host);
  const trigger = useRef<HTMLElement | null>(null);
  const [error, setError] = useState<string>();
  let title = localize('com_media_delete_selected');
  if (request.mode === 'all') title = localize('com_media_clear_all_title');
  else if (request.threadIds.length === 1) title = localize('com_media_delete_title');
  const changeOpen = (value: boolean) => {
    if (remove.isLoading) return;
    setError(undefined);
    onOpenChange(value);
  };
  const submit = async () => {
    setError(undefined);
    try {
      const result = await remove.mutateAsync(request);
      if (!host.isCurrentSession()) return;
      onDeleted?.(result.failures.map((failure) => failure.threadId));
      if (result.failures.length) {
        setError(localize('com_media_delete_partial', { count: result.failures.length }));
      } else onOpenChange(false);
    } catch (failure) {
      if (host.isCurrentSession()) setError(localize(mediaErrorLabels[mediaErrorCode(failure)]));
    }
  };
  return (
    <OGDialog open={open} onOpenChange={changeOpen}>
      <OGDialogContent
        onOpenAutoFocus={() => {
          const activeElement = document.activeElement;
          trigger.current = activeElement instanceof HTMLElement ? activeElement : null;
        }}
        onCloseAutoFocus={(event) => {
          if (!trigger.current?.isConnected) return;
          event.preventDefault();
          trigger.current.focus();
        }}
      >
        <OGDialogTitle>{title}</OGDialogTitle>
        <OGDialogDescription>{localize('com_media_delete_description')}</OGDialogDescription>
        {error && (
          <p role="alert" className="text-sm text-text-secondary">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" disabled={remove.isLoading} onClick={() => changeOpen(false)}>
            {localize('com_ui_cancel')}
          </Button>
          <Button variant="destructive" disabled={remove.isLoading} onClick={() => void submit()}>
            {remove.isLoading && <Spinner className="size-4" />}
            {localize('com_ui_delete')}
          </Button>
        </div>
      </OGDialogContent>
    </OGDialog>
  );
}
