import React, { memo, useMemo, useRef } from 'react';
import { TerminalSquareIcon } from 'lucide-react';
import {
  Tools,
  AuthType,
  PermissionTypes,
  Permissions,
  LocalStorageKeys,
} from 'librechat-data-provider';
import ApiKeyDialog from '~/components/SidePanel/Agents/Code/ApiKeyDialog';
import { useLocalize, useHasAccess, useCodeApiKeyForm, useToolToggle } from '~/hooks';
import CheckboxButton from '~/components/ui/CheckboxButton';
import { useVerifyAgentToolAuth } from '~/data-provider';
import { useBadgeRowContext } from '~/Providers';

function CodeInterpreter() {
  const triggerRef = useRef<HTMLInputElement>(null);
  const localize = useLocalize();
  const { conversationId } = useBadgeRowContext();

  const canRunCode = useHasAccess({
    permissionType: PermissionTypes.RUN_CODE,
    permission: Permissions.USE,
  });

  const { data } = useVerifyAgentToolAuth(
    { toolId: Tools.execute_code },
    {
      retry: 1,
    },
  );
  const authType = useMemo(() => data?.message ?? false, [data?.message]);
  const isAuthenticated = useMemo(() => data?.authenticated ?? false, [data?.authenticated]);
  const { methods, onSubmit, isDialogOpen, setIsDialogOpen, handleRevokeApiKey } =
    useCodeApiKeyForm({});

  const { toggleState: runCode, debouncedChange } = useToolToggle({
    conversationId,
    isAuthenticated,
    setIsDialogOpen,
    toolKey: Tools.execute_code,
    localStorageKey: LocalStorageKeys.LAST_CODE_TOGGLE_,
  });

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
        isToolAuthenticated={isAuthenticated}
        isUserProvided={authType === AuthType.USER_PROVIDED}
      />
    </>
  );
}

export default memo(CodeInterpreter);
