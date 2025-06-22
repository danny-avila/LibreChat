import React, { memo, useMemo, useRef } from 'react';
import { TerminalSquareIcon } from 'lucide-react';
import { AuthType, PermissionTypes, Permissions } from 'librechat-data-provider';
import ApiKeyDialog from '~/components/SidePanel/Agents/Code/ApiKeyDialog';
import CheckboxButton from '~/components/ui/CheckboxButton';
import { useLocalize, useHasAccess } from '~/hooks';
import { useBadgeRowContext } from '~/Providers';

function CodeInterpreter() {
  const triggerRef = useRef<HTMLInputElement>(null);
  const localize = useLocalize();
  const { codeInterpreter, codeApiKeyForm } = useBadgeRowContext();
  const { toggleState: runCode, debouncedChange, authData } = codeInterpreter;
  const { methods, onSubmit, isDialogOpen, setIsDialogOpen, handleRevokeApiKey } = codeApiKeyForm;

  const canRunCode = useHasAccess({
    permissionType: PermissionTypes.RUN_CODE,
    permission: Permissions.USE,
  });

  const authType = useMemo(() => authData?.message ?? false, [authData?.message]);

  if (!canRunCode) {
    return null;
  }

  return (
    <>
      <CheckboxButton
        ref={triggerRef}
        className="max-w-fit"
        defaultChecked={runCode}
        setValue={debouncedChange}
        label={localize('com_assistants_code_interpreter')}
        isCheckedClassName="border-purple-600/40 bg-purple-500/10 hover:bg-purple-700/10"
        icon={<TerminalSquareIcon className="icon-md" />}
      />
      <ApiKeyDialog
        onSubmit={onSubmit}
        isOpen={isDialogOpen}
        triggerRef={triggerRef}
        register={methods.register}
        onRevoke={handleRevokeApiKey}
        onOpenChange={setIsDialogOpen}
        handleSubmit={methods.handleSubmit}
        isUserProvided={authType === AuthType.USER_PROVIDED}
        isToolAuthenticated={authData?.authenticated ?? false}
      />
    </>
  );
}

export default memo(CodeInterpreter);
