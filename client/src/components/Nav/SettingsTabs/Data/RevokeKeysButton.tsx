import {
  useRevokeAllUserKeysMutation,
  useRevokeUserKeyMutation,
} from 'librechat-data-provider/react-query';
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
      infoDescriptionCode={'com_nav_info_revoke'}
      dataTestIdInitial={'revoke-all-keys-initial'}
      dataTestIdConfirm={'revoke-all-keys-confirm'}
      mutation={all ? revokeKeysMutation : revokeKeyMutation}
    />
  );
};
