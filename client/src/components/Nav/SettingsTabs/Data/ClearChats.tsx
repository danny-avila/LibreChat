import React, { useState } from 'react';
import { useClearConversationsMutation } from 'librechat-data-provider/react-query';
import { Label, Button, OGDialog, OGDialogTrigger, Spinner } from '~/components';
import { useConversation, useConversations, useLocalize } from '~/hooks';
import OGDialogTemplate from '~/components/ui/OGDialogTemplate';

export const ClearChats = () => {
  const localize = useLocalize();
  const [open, setOpen] = useState(false);
  const { newConversation } = useConversation();
  const { refreshConversations } = useConversations();
  const clearConvosMutation = useClearConversationsMutation();

  const clearConvos = () => {
    clearConvosMutation.mutate(
      {},
      {
        onSuccess: () => {
          newConversation();
          refreshConversations();
        },
      },
    );
  };

  return (
    <div className="flex items-center justify-between">
      <Label className="font-light">{localize('com_nav_clear_all_chats')}</Label>
      <OGDialog open={open} onOpenChange={setOpen}>
        <OGDialogTrigger asChild>
          <Button
            variant="destructive"
            className="flex items-center justify-center rounded-lg transition-colors duration-200"
            onClick={() => setOpen(true)}
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
              {localize('com_nav_clear_conversation_confirm_message')}
            </Label>
          }
          selection={{
            selectHandler: clearConvos,
            selectClasses:
              'bg-destructive text-white transition-all duration-200 hover:bg-destructive/80',
            selectText: clearConvosMutation.isLoading ? <Spinner /> : localize('com_ui_delete'),
          }}
        />
      </OGDialog>
    </div>
  );
};
