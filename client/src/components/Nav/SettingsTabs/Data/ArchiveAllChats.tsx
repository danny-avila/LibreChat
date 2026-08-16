import React, { useState } from 'react';
import {
  Label,
  Button,
  Spinner,
  OGDialog,
  OGDialogTrigger,
  useToastContext,
  OGDialogTemplate,
} from '@librechat/client';
import { useArchiveAllConversationsMutation } from '~/data-provider';
import useNewChat from '~/hooks/Chat/useNewChat';
import { NotificationSeverity } from '~/common';
import { useLocalize } from '~/hooks';

export const ArchiveAllChats = () => {
  const localize = useLocalize();
  const [open, setOpen] = useState(false);
  const { startNewChat } = useNewChat();
  const { showToast } = useToastContext();

  const archiveAllMutation = useArchiveAllConversationsMutation({
    onSuccess: () => {
      /** Drops the archived chat the user was reading, message cache included. */
      startNewChat();
      showToast({
        message: localize('com_ui_archive_all_success'),
        severity: NotificationSeverity.SUCCESS,
        showIcon: true,
      });
    },
    onError: () => {
      showToast({
        message: localize('com_ui_archive_all_error'),
        severity: NotificationSeverity.ERROR,
        showIcon: true,
      });
    },
  });

  return (
    <div className="flex items-center justify-between">
      <Label id="archive-all-chats-label">{localize('com_nav_archive_all_chats')}</Label>
      <OGDialog open={open} onOpenChange={setOpen}>
        <OGDialogTrigger asChild>
          <Button
            aria-labelledby="archive-all-chats-label"
            variant="outline"
            onClick={() => setOpen(true)}
          >
            {localize('com_ui_archive')}
          </Button>
        </OGDialogTrigger>
        <OGDialogTemplate
          showCloseButton={false}
          title={localize('com_nav_confirm_archive_all')}
          className="max-w-[450px]"
          main={
            <Label className="break-words">{localize('com_nav_archive_all_confirm_message')}</Label>
          }
          selection={{
            selectHandler: () => archiveAllMutation.mutate(),
            selectClasses: 'bg-surface-submit text-text-on-status hover:bg-surface-submit-hover',
            selectText: archiveAllMutation.isLoading ? <Spinner /> : localize('com_ui_archive'),
          }}
        />
      </OGDialog>
    </div>
  );
};
