import React, { memo } from 'react';
import CheckboxButton from '~/components/ui/CheckboxButton';
import { useBadgeRowContext } from '~/Providers';
import { VectorIcon } from '~/components/svg';
import { useLocalize } from '~/hooks';

function FileSearch() {
  const localize = useLocalize();
  const { fileSearch } = useBadgeRowContext();
  const { toggleState: fileSearchEnabled, debouncedChange, isPinned } = fileSearch;

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
