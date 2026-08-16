import React, { useRef, useState } from 'react';
import { Constants } from 'librechat-data-provider';
import {
  Label,
  Button,
  Spinner,
  OGDialog,
  OGDialogClose,
  OGDialogTrigger,
  useToastContext,
  OGDialogTemplate,
} from '@librechat/client';
import type { TConversation } from 'librechat-data-provider';
import useGetConversation from '~/hooks/Conversations/useGetConversation';
import { useArchiveAllConversationsMutation } from '~/data-provider';
import { isTemporaryConversation } from '~/utils';
import useNewChat from '~/hooks/Chat/useNewChat';
import { NotificationSeverity } from '~/common';
import { useLocalize } from '~/hooks';

export const ArchiveAllChats = () => {
  const localize = useLocalize();
  const [open, setOpen] = useState(false);
  const submittedConversationRef = useRef<Pick<
    TConversation,
    'conversationId' | 'isTemporary' | 'expiredAt'
  > | null>(null);
  const getConversation = useGetConversation();
  const { startNewChat } = useNewChat();
  const { showToast } = useToastContext();

  const archiveAllMutation = useArchiveAllConversationsMutation({
    onSuccess: () => {
      const submittedConversation = submittedConversationRef.current;
      const currentConversation = getConversation();
      submittedConversationRef.current = null;
      if (
        submittedConversation != null &&
        submittedConversation.conversationId !== Constants.NEW_CONVO &&
        !isTemporaryConversation(submittedConversation) &&
        currentConversation?.conversationId === submittedConversation.conversationId &&
        !isTemporaryConversation(currentConversation)
      ) {
        startNewChat();
      }
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

  const archiveAllChats = () => {
    const conversation = getConversation();
    submittedConversationRef.current = conversation?.conversationId
      ? {
          conversationId: conversation.conversationId,
          isTemporary: conversation.isTemporary,
          expiredAt: conversation.expiredAt,
        }
      : null;
    archiveAllMutation.mutate();
  };

  return (
    <div className="flex items-center justify-between">
      <Label id="archive-all-chats-label">{localize('com_nav_archive_all_chats')}</Label>
      <OGDialog open={open} onOpenChange={setOpen}>
        <OGDialogTrigger asChild>
          <Button
            aria-labelledby="archive-all-chats-label"
            variant="outline"
            disabled={archiveAllMutation.isLoading}
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
          selection={
            <OGDialogClose asChild>
              <Button
                aria-label={localize('com_ui_archive')}
                aria-busy={archiveAllMutation.isLoading}
                disabled={archiveAllMutation.isLoading}
                variant="submit"
                className="border-none font-normal max-sm:order-first max-sm:w-full sm:order-none"
                onClick={archiveAllChats}
              >
                {archiveAllMutation.isLoading ? <Spinner /> : localize('com_ui_archive')}
              </Button>
            </OGDialogClose>
          }
        />
      </OGDialog>
    </div>
  );
};
