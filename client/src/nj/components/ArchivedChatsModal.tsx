import { OGDialog, OGDialogTemplate } from '@librechat/client';
import { useLocalize } from '~/hooks';
import ArchivedChatsTable from '~/components/Nav/SettingsTabs/General/ArchivedChatsTable';
import React from 'react';

/**
 * Similar to `ArchivedChats`, but only contains the modal (no buttons for accessing it).
 *
 * Models itself after `MyFilesModal`.
 */
export default function ArchivedChatsModal({
  open,
  onOpenChange,
  triggerRef,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  triggerRef?: React.RefObject<HTMLButtonElement | HTMLDivElement | null>;
}) {
  const localize = useLocalize();

  return (
    <OGDialog open={open} onOpenChange={onOpenChange} triggerRef={triggerRef}>
      <OGDialogTemplate
        title={localize('com_nav_archived_chats')}
        className="max-w-[1000px]"
        showCancelButton={false}
        main={<ArchivedChatsTable onOpenChange={onOpenChange} />}
      />
    </OGDialog>
  );
}
