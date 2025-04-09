import React, { memo, useMemo, useCallback } from 'react';
import { useRecoilState } from 'recoil';
import { TerminalSquareIcon } from 'lucide-react';
import { Constants, LocalStorageKeys, PermissionTypes, Permissions } from 'librechat-data-provider';
import CheckboxButton from '~/components/ui/CheckboxButton';
import useLocalStorage from '~/hooks/useLocalStorageAlt';
import { useLocalize, useHasAccess } from '~/hooks';
import { ephemeralAgentByConvoId } from '~/store';

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
  );

  if (!canRunCode) {
    return null;
  }

  return (
    <CheckboxButton
      className="max-w-fit"
      setValue={setRunCode}
      label={localize('com_assistants_code_interpreter')}
      isCheckedClassName="border-purple-600/40 bg-purple-500/10 hover:bg-purple-700/10"
      icon={<TerminalSquareIcon className="icon-md" />}
      // label={localize('com_ui_code_interpreter')}
    />
  );
}

export default memo(CodeInterpreter);
