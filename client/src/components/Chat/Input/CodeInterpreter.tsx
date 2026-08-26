import React, { memo } from 'react';
import { TerminalSquareIcon } from 'lucide-react';
import { CheckboxButton } from '@librechat/client';
import { PermissionTypes, Permissions } from 'librechat-data-provider';
import { useLocalize, useHasAccess } from '~/hooks';
import { useBadgeRowContext } from '~/Providers';
import { badgeAccents } from './accents';

function CodeInterpreter() {
  const localize = useLocalize();
  const context = useBadgeRowContext();
  const { toggleState: runCode, debouncedChange, isPinned } = context?.codeInterpreter ?? {};

  const canRunCode = useHasAccess({
    permissionType: PermissionTypes.RUN_CODE,
    permission: Permissions.USE,
  });

  if (!canRunCode) {
    return null;
  }

  return (
    (runCode || isPinned) && (
      <CheckboxButton
        checked={runCode}
        setValue={debouncedChange}
        label={localize('com_ui_run_code')}
        isCheckedClassName={badgeAccents.purple}
        icon={<TerminalSquareIcon className="icon-md" aria-hidden="true" />}
      />
    )
  );
}

export default memo(CodeInterpreter);
