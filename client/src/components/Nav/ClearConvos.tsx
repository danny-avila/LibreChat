import { useState } from 'react';
import { Dialog } from '~/components/ui/';
import DialogTemplate from '~/components/ui/DialogTemplate';
import { ClearChatsButton } from './SettingsTabs/';
import { useClearConversationsMutation } from 'librechat-data-provider/react-query';
import { useLocalize, useConversation, useConversations } from '~/hooks';

const ClearConvos = ({ open, onOpenChange }) => {
  const { newConversation } = useConversation();
  const { refreshConversations } = useConversations();
  const clearConvosMutation = useClearConversationsMutation();
  const [confirmClear, setConfirmClear] = useState(false);
  const localize = useLocalize();

  // Clear all conversations
  const clearConvos = () => {
    if (confirmClear) {
      console.log('Clearing conversations...');
      clearConvosMutation.mutate(
        {},
        {
          onSuccess: () => {
            newConversation();
            refreshConversations();
          },
        },
      );
      setConfirmClear(false);
    } else {
      setConfirmClear(true);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTemplate
        title={localize('com_nav_clear_conversation')}
        className="w-11/12 max-w-[650px] sm:w-3/4 md:w-3/4 lg:w-3/4"
        headerClassName="border-none"
        description={localize('com_nav_clear_conversation_confirm_message')}
        buttons={
          <ClearChatsButton
            showText={false}
            confirmClear={confirmClear}
            onClick={clearConvos}
            className="w-[77px]"
          />
        }
      />
    </Dialog>
  );
};

export default ClearConvos;
