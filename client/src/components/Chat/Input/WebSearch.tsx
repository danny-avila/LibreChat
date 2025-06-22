import React, { memo, useRef, useMemo } from 'react';
import { Globe } from 'lucide-react';
import { Tools, Permissions, PermissionTypes, LocalStorageKeys } from 'librechat-data-provider';
import { useLocalize, useHasAccess, useSearchApiKeyForm, useToolToggle } from '~/hooks';
import ApiKeyDialog from '~/components/SidePanel/Agents/Search/ApiKeyDialog';
import CheckboxButton from '~/components/ui/CheckboxButton';
import { useVerifyAgentToolAuth } from '~/data-provider';
import { useBadgeRowContext } from '~/Providers';

function WebSearch() {
  const triggerRef = useRef<HTMLInputElement>(null);
  const localize = useLocalize();
  const { conversationId } = useBadgeRowContext();

  const canUseWebSearch = useHasAccess({
    permissionType: PermissionTypes.WEB_SEARCH,
    permission: Permissions.USE,
  });

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

  const { toggleState: webSearch, debouncedChange } = useToolToggle({
    conversationId,
    toolKey: Tools.web_search,
    localStorageKey: LocalStorageKeys.LAST_WEB_SEARCH_TOGGLE_,
    isAuthenticated,
    setIsDialogOpen,
  });

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
