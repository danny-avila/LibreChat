import React, { memo } from 'react';
import { TerminalSquareIcon } from 'lucide-react';
import { PermissionTypes, Permissions } from 'librechat-data-provider';
import CheckboxButton from '~/components/ui/CheckboxButton';
import { useLocalize, useHasAccess } from '~/hooks';
import { useBadgeRowContext } from '~/Providers';

function CodeInterpreter() {
  const localize = useLocalize();
  const { codeInterpreter, codeApiKeyForm } = useBadgeRowContext();
  const { toggleState: runCode, debouncedChange, isPinned } = codeInterpreter;
  const { badgeTriggerRef } = codeApiKeyForm;

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
        ref={badgeTriggerRef}
        className="max-w-fit"
        checked={runCode}
        setValue={debouncedChange}
        label={localize('com_assistants_code_interpreter')}
        isCheckedClassName="border-purple-600/40 bg-purple-500/10 hover:bg-purple-700/10"
        icon={<TerminalSquareIcon className="icon-md" />}
      />
    )
  );
}

export default memo(CodeInterpreter);
