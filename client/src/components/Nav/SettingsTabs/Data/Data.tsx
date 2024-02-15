import * as Tabs from '@radix-ui/react-tabs';
import {
  useRevokeAllUserKeysMutation,
  useRevokeUserKeyMutation,
} from 'librechat-data-provider/react-query';
import { SettingsTabValues } from 'librechat-data-provider';
import React, { useState, useCallback, useRef } from 'react';
import { useOnClickOutside } from '~/hooks';
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
  const [confirmClear, setConfirmClear] = useState(false);
  const revokeKeyMutation = useRevokeUserKeyMutation(endpoint);
  const revokeKeysMutation = useRevokeAllUserKeysMutation();

  const contentRef = useRef(null);
  useOnClickOutside(contentRef, () => confirmClear && setConfirmClear(false), []);

  const revokeAllUserKeys = useCallback(() => {
    if (confirmClear) {
      revokeKeysMutation.mutate({});
      setConfirmClear(false);
    } else {
      setConfirmClear(true);
    }
  }, [confirmClear, revokeKeysMutation]);

  const revokeUserKey = useCallback(() => {
    if (!endpoint) {
      return;
    } else if (confirmClear) {
      revokeKeyMutation.mutate({});
      setConfirmClear(false);
    } else {
      setConfirmClear(true);
    }
  }, [confirmClear, revokeKeyMutation, endpoint]);

  const onClick = all ? revokeAllUserKeys : revokeUserKey;

  return (
    <DangerButton
      ref={contentRef}
      showText={showText}
      onClick={onClick}
      disabled={disabled}
      confirmClear={confirmClear}
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
  return (
    <Tabs.Content
      value={SettingsTabValues.DATA}
      role="tabpanel"
      className="w-full md:min-h-[300px]"
    >
      <div className="flex flex-col gap-3 text-sm text-gray-600 dark:text-gray-300">
        <div className="border-b pb-3 last-of-type:border-b-0 dark:border-gray-700">
          <RevokeKeysButton all={true} />
        </div>
      </div>
    </Tabs.Content>
  );
}

export default React.memo(Data);
