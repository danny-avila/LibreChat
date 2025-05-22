import React, { memo, useRef, useMemo, useCallback } from 'react';
import { Globe } from 'lucide-react';
import debounce from 'lodash/debounce';
import { useRecoilState } from 'recoil';
import {
  Tools,
  AuthType,
  Constants,
  Permissions,
  PermissionTypes,
  LocalStorageKeys,
} from 'librechat-data-provider';
import ApiKeyDialog from '~/components/SidePanel/Agents/Search/ApiKeyDialog';
import { useLocalize, useHasAccess, useSearchApiKeyForm } from '~/hooks';
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

function WebSearch({ conversationId }: { conversationId?: string | null }) {
  const triggerRef = useRef<HTMLInputElement>(null);
  const localize = useLocalize();
  const key = conversationId ?? Constants.NEW_CONVO;

  const canUseWebSearch = useHasAccess({
    permissionType: PermissionTypes.WEB_SEARCH,
    permission: Permissions.USE,
  });
  const [ephemeralAgent, setEphemeralAgent] = useRecoilState(ephemeralAgentByConvoId(key));
  const isWebSearchToggleEnabled = useMemo(() => {
    return ephemeralAgent?.web_search ?? false;
  }, [ephemeralAgent?.web_search]);

  const { data } = useVerifyAgentToolAuth(
    { toolId: Tools.web_search },
    {
      retry: 1,
    },
  );
  const authTypes = useMemo(() => data?.authTypes ?? [], [data?.authTypes]);
  const isAuthenticated = useMemo(() => data?.authenticated ?? false, [data?.authenticated]);
  const { methods, onSubmit, isDialogOpen, setIsDialogOpen, handleRevokeApiKey } =
    useSearchApiKeyForm({});

  const setValue = useCallback(
    (isChecked: boolean) => {
      setEphemeralAgent((prev) => ({
        ...prev,
        web_search: isChecked,
      }));
    },
    [setEphemeralAgent],
  );

  const [webSearch, setWebSearch] = useLocalStorage<boolean>(
    `${LocalStorageKeys.LAST_WEB_SEARCH_TOGGLE_}${key}`,
    isWebSearchToggleEnabled,
    setValue,
    storageCondition,
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>, isChecked: boolean) => {
      if (!isAuthenticated) {
        setIsDialogOpen(true);
        e.preventDefault();
        return;
      }
      setWebSearch(isChecked);
    },
    [setWebSearch, setIsDialogOpen, isAuthenticated],
  );

  const debouncedChange = useMemo(
    () => debounce(handleChange, 50, { leading: true }),
    [handleChange],
  );

  if (!canUseWebSearch) {
    return null;
  }

  return (
    <>
      <CheckboxButton
        ref={triggerRef}
        className="max-w-fit"
        defaultChecked={webSearch}
        setValue={debouncedChange}
        label={localize('com_ui_search')}
        isCheckedClassName="border-blue-600/40 bg-blue-500/10 hover:bg-blue-700/10"
        icon={<Globe className="icon-md" />}
      />
      <ApiKeyDialog
        onSubmit={onSubmit}
        authTypes={authTypes}
        isOpen={isDialogOpen}
        triggerRef={triggerRef}
        register={methods.register}
        onRevoke={handleRevokeApiKey}
        onOpenChange={setIsDialogOpen}
        handleSubmit={methods.handleSubmit}
        isToolAuthenticated={isAuthenticated}
      />
    </>
  );
}

export default memo(WebSearch);
