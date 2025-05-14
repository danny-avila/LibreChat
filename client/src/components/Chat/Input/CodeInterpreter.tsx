import debounce from 'lodash/debounce';
import React, { memo, useMemo, useCallback } from 'react';
import { useRecoilState } from 'recoil';
import { TerminalSquareIcon } from 'lucide-react';
import {
  Tools,
  AuthType,
  Constants,
  LocalStorageKeys,
  PermissionTypes,
  Permissions,
} from 'librechat-data-provider';
import ApiKeyDialog from '~/components/SidePanel/Agents/Code/ApiKeyDialog';
import { useLocalize, useHasAccess, useCodeApiKeyForm } from '~/hooks';
import CheckboxButton from '~/components/ui/CheckboxButton';
import useLocalStorage from '~/hooks/useLocalStorageAlt';
import { useVerifyAgentToolAuth } from '~/data-provider';
import { ephemeralAgentByConvoId } from '~/store';

const storageCondition = (value: unknown, rawCurrentValue?: string | null) => {
  if (rawCurrentValue) {
    try {
      const currentValue = rawCurrentValue?.trim() ?? '';
      if (currentValue === 'true' && value === false) {
        return true;
      }
    } catch (e) {
      console.error(e);
    }
  }
  return value !== undefined && value !== null && value !== '' && value !== false;
};

function CodeInterpreter({ conversationId }: { conversationId?: string | null }) {
  const localize = useLocalize();
  const key = conversationId ?? Constants.NEW_CONVO;

  const canRunCode = useHasAccess({
    permissionType: PermissionTypes.RUN_CODE,
    permission: Permissions.USE,
  });
  const [ephemeralAgent, setEphemeralAgent] = useRecoilState(ephemeralAgentByConvoId(key));
  const isCodeToggleEnabled = useMemo(() => {
    return ephemeralAgent?.execute_code ?? false;
  }, [ephemeralAgent?.execute_code]);

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

  const setValue = useCallback(
    (isChecked: boolean) => {
      setEphemeralAgent((prev) => ({
        ...prev,
        execute_code: isChecked,
      }));
    },
    [setEphemeralAgent],
  );

  const [runCode, setRunCode] = useLocalStorage<boolean>(
    `${LocalStorageKeys.LAST_CODE_TOGGLE_}${key}`,
    isCodeToggleEnabled,
    setValue,
    storageCondition,
  );

  const handleChange = useCallback(
    (isChecked: boolean) => {
      if (!isAuthenticated) {
        setIsDialogOpen(true);
        return;
      }
      setRunCode(isChecked);
    },
    [setRunCode, setIsDialogOpen, isAuthenticated],
  );

  const debouncedChange = useMemo(
    () => debounce(handleChange, 50, { leading: true }),
    [handleChange],
  );

  if (!canRunCode) {
    return null;
  }

  return (
    <>
      <CheckboxButton
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
