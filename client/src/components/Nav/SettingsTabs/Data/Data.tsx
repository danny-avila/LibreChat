import * as Tabs from '@radix-ui/react-tabs';
import {
  useRevokeUserKeyMutation,
  useRevokeAllUserKeysMutation,
  useClearConversationsMutation,
} from 'librechat-data-provider/react-query';
import { SettingsTabValues } from 'librechat-data-provider';
import React, { useState, useCallback, useRef } from 'react';
import { useConversation, useConversations, useOnClickOutside } from '~/hooks';
import ImportConversations from './ImportConversations';
import { ClearChatsButton } from './ClearChats';
import DangerButton from '../DangerButton';

export const RevokeKeysButton = ({
  showText = true,
  endpoint = '',
  all = false,
  disabled = false,
}: {
  showText?: boolean;
  endpoint?: string;
  all?: boolean;
  disabled?: boolean;
}) => {
  const [confirmRevoke, setConfirmRevoke] = useState(false);

  const revokeKeysMutation = useRevokeAllUserKeysMutation();
  const revokeKeyMutation = useRevokeUserKeyMutation(endpoint);

  const revokeContentRef = useRef(null);
  useOnClickOutside(revokeContentRef, () => confirmRevoke && setConfirmRevoke(false), []);

  const revokeAllUserKeys = useCallback(() => {
    if (confirmRevoke) {
      revokeKeysMutation.mutate({});
      setConfirmRevoke(false);
    } else {
      setConfirmRevoke(true);
    }
  }, [confirmRevoke, revokeKeysMutation]);

  const revokeUserKey = useCallback(() => {
    if (!endpoint) {
      return;
    } else if (confirmRevoke) {
      revokeKeyMutation.mutate({});
      setConfirmRevoke(false);
    } else {
      setConfirmRevoke(true);
    }
  }, [confirmRevoke, revokeKeyMutation, endpoint]);

  const onClick = all ? revokeAllUserKeys : revokeUserKey;

  return (
    <DangerButton
      ref={revokeContentRef}
      showText={showText}
      onClick={onClick}
      disabled={disabled}
      confirmClear={confirmRevoke}
      id={'revoke-all-user-keys'}
      actionTextCode={'com_ui_revoke'}
      infoTextCode={'com_ui_revoke_info'}
      dataTestIdInitial={'revoke-all-keys-initial'}
      dataTestIdConfirm={'revoke-all-keys-confirm'}
      mutation={all ? revokeKeysMutation : revokeKeyMutation}
    />
  );
};

function Data() {
  const dataTabRef = useRef(null);
  const [confirmClearConvos, setConfirmClearConvos] = useState(false);
  useOnClickOutside(dataTabRef, () => confirmClearConvos && setConfirmClearConvos(false), []);

  const { newConversation } = useConversation();
  const { refreshConversations } = useConversations();
  const clearConvosMutation = useClearConversationsMutation();

  const clearConvos = () => {
    if (confirmClearConvos) {
      console.log('Clearing conversations...');
      setConfirmClearConvos(false);
      clearConvosMutation.mutate(
        {},
        {
          onSuccess: () => {
            newConversation();
            refreshConversations();
          },
        },
      );
    } else {
      setConfirmClearConvos(true);
    }
  };

  return (
    <Tabs.Content
      value={SettingsTabValues.DATA}
      role="tabpanel"
      className="w-full md:min-h-[271px]"
      ref={dataTabRef}
    >
      <div className="flex flex-col gap-3 text-sm text-gray-600 dark:text-gray-50">
        <div className="border-b pb-3 last-of-type:border-b-0 dark:border-gray-600">
          <ImportConversations />
        </div>
        <div className="border-b pb-3 last-of-type:border-b-0 dark:border-gray-600">
          <RevokeKeysButton all={true} />
        </div>

        <div className="border-b pb-3 last-of-type:border-b-0 dark:border-gray-600">
          <ClearChatsButton
            confirmClear={confirmClearConvos}
            onClick={clearConvos}
            showText={true}
            mutation={clearConvosMutation}
          />
        </div>
      </div>
    </Tabs.Content>
  );
}

export default React.memo(Data);
