import React, { memo } from 'react';
import { CheckboxButton, VectorIcon } from '@librechat/client';
import { PermissionTypes, Permissions } from 'librechat-data-provider';
import { useLocalize, useHasAccess } from '~/hooks';
import { useBadgeRowContext } from '~/Providers';

function FileSearch() {
  const localize = useLocalize();
  const { fileSearch } = useBadgeRowContext();
  const { toggleState: fileSearchEnabled, debouncedChange, isPinned } = fileSearch;

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
          className="max-w-fit"
          checked={fileSearchEnabled}
          setValue={debouncedChange}
          label={localize('com_assistants_file_search')}
          isCheckedClassName="border-green-600/40 bg-green-500/10 hover:bg-green-700/10"
          icon={<VectorIcon className="icon-md" />}
        />
      )}
    </>
  );
}

export default memo(FileSearch);
