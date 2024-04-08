import * as Tabs from '@radix-ui/react-tabs';
import {
  useRevokeAllUserKeysMutation,
  useRevokeUserKeyMutation,
} from 'librechat-data-provider/react-query';
import { SettingsTabValues } from 'librechat-data-provider';
import React, { useState, useCallback, useRef } from 'react';
import { useOnClickOutside } from '~/hooks';
import DangerButton from '../DangerButton';
import { useImportFileHandling } from '~/hooks';

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

// button that opens select file dialog where user can choose only json file and sends the file to as a post request to /api/convos endpoint
export const ImportDataButton = () => {
  const fileInputRef = useRef(null);
  const uploadFile = useImportFileHandling();

  const handleFileChange = (event) => {
    console.log('file change');
    const file = event.target.files[0];
    if (file) {
      // const formData = new FormData();
      // formData.append('file', file);

      console.log('call handleFiles');
      uploadFile.handleFiles(file);
    }
  };

  const handleClick = () => {
    fileInputRef.current.click();
  };

  return (
    <div>
      <input
        type="file"
        accept=".json"
        style={{ display: 'none' }}
        ref={fileInputRef}
        onChange={handleFileChange} // Hook handleFileUpload to the onChange event of the input element
      />
      <DangerButton
        confirmClear={false} // Add the missing confirmClear prop
        showText={true} // Add the missing showText prop
        onClick={handleClick} // Add an empty onClick function
        id={'import-conversations'}
        actionTextCode={'com_ui_import_conversation'} // TODO: update
        infoTextCode={'com_ui_import_conversation_info'} // TODO: update
        dataTestIdInitial={'revoke-all-keys-initial'} // TODO: update
        dataTestIdConfirm={'revoke-all-keys-confirm'} // TODO: update
        //mutation={null} // Replace the missing mutation prop with the appropriate value
      />
    </div>
  );
};

function Data() {
  return (
    <Tabs.Content
      value={SettingsTabValues.DATA}
      role="tabpanel"
      className="w-full md:min-h-[300px]"
    >
      <div className="flex flex-col gap-3 text-sm text-gray-600 dark:text-gray-50">
        <div className="border-b pb-3 last-of-type:border-b-0 dark:border-gray-700">
          <RevokeKeysButton all={true} />
        </div>
        <div className="border-b pb-3 last-of-type:border-b-0 dark:border-gray-700">
          <ImportDataButton />
        </div>
      </div>
    </Tabs.Content>
  );
}

export default React.memo(Data);
