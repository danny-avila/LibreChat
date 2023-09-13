import { useState, useEffect, useCallback } from 'react';
import { Dialog } from '~/components/ui/';
import DialogTemplate from '~/components/ui/DialogTemplate';
import { ClearChatsButton } from './SettingsTabs/';
import { useClearConversationsMutation } from 'librechat-data-provider';
import store from '~/store';
import { useLocalize } from '~/hooks';

const ClearConvos = ({ open, onOpenChange }) => {
  const { newConversation } = store.useConversation();
  const { refreshConversations } = store.useConversations();
  const clearConvosMutation = useClearConversationsMutation();
  const [confirmClear, setConfirmClear] = useState(false);
  const localize = useLocalize();

  const clearConvos = useCallback(() => {
    if (confirmClear) {
      console.log('Clearing conversations...');
      clearConvosMutation.mutate({});
      setConfirmClear(false);
    } else {
      setConfirmClear(true);
    }
  }, [confirmClear, clearConvosMutation]);

  useEffect(() => {
    if (clearConvosMutation.isSuccess) {
      refreshConversations();
      newConversation();
    }
  }, [clearConvosMutation.isSuccess, newConversation, refreshConversations]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTemplate
        title={localize('com_nav_clear_conversation')}
        className="w-full max-w-[650px] sm:w-3/4 md:w-3/4 lg:w-3/4"
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
