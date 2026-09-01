import React, { memo } from 'react';
import { CheckboxButton, VectorIcon } from '@librechat/client';
import { PermissionTypes, Permissions } from 'librechat-data-provider';
import { useLocalize, useHasAccess } from '~/hooks';
import { useBadgeRowContext } from '~/Providers';
import { badgeAccents } from './accents';

function FileSearch() {
  const localize = useLocalize();
  const context = useBadgeRowContext();
  const { toggleState: fileSearchEnabled, debouncedChange, isPinned } = context?.fileSearch ?? {};

  const canUseFileSearch = useHasAccess({
    permissionType: PermissionTypes.FILE_SEARCH,
    permission: Permissions.USE,
  });

  if (!canUseFileSearch) {
    return null;
  }

  return (
    <>
      {(fileSearchEnabled || isPinned) && (
        <CheckboxButton
          checked={fileSearchEnabled}
          setValue={debouncedChange}
          label={localize('com_assistants_file_search')}
          isCheckedClassName={badgeAccents.green}
          icon={<VectorIcon className="icon-md" />}
        />
      )}
    </>
  );
}

export default memo(FileSearch);
