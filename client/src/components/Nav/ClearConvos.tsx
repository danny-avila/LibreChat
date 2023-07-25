import { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogTemplate } from '../ui/';
import { ClearChatsButton } from './SettingsTabs/';
import { useClearConversationsMutation } from '@librechat/data-provider';
import store from '~/store';
import { useRecoilValue } from 'recoil';
import { localize } from '~/localization/Translation';

const ClearConvos = ({ open, onOpenChange }) => {
  const { newConversation } = store.useConversation();
  const { refreshConversations } = store.useConversations();
  const clearConvosMutation = useClearConversationsMutation();
  const [confirmClear, setConfirmClear] = useState(false);
  const lang = useRecoilValue(store.lang);

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
        title={localize(lang, 'com_nav_clear_conversation')}
        description={localize(lang, 'com_nav_clear_conversation_confirm_message')}
        leftButtons={
          <ClearChatsButton showText={false} confirmClear={confirmClear} onClick={clearConvos} />
        }
      />
    </Dialog>
  );
};

export default ClearConvos;
