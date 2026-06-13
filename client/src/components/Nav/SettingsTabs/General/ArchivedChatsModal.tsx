import { OGDialog, OGDialogContent, OGDialogHeader, OGDialogTitle } from '@librechat/client';
import type { RefObject } from 'react';
import ArchivedChatsTable from './ArchivedChatsTable';
import { useLocalize } from '~/hooks';

export function ArchivedChatsModal({
  open,
  onOpenChange,
  triggerRef,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  triggerRef?: RefObject<HTMLButtonElement | HTMLDivElement | null>;
}) {
  const localize = useLocalize();

  return (
    <OGDialog open={open} onOpenChange={onOpenChange} triggerRef={triggerRef}>
      <OGDialogContent
        title={localize('com_nav_archived_chats')}
        className="w-11/12 max-w-[1000px] bg-background text-text-primary shadow-2xl"
      >
        <OGDialogHeader>
          <OGDialogTitle>{localize('com_nav_archived_chats')}</OGDialogTitle>
        </OGDialogHeader>
        <ArchivedChatsTable onOpenChange={onOpenChange} />
      </OGDialogContent>
    </OGDialog>
  );
}
