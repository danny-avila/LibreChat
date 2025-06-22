import React, { memo, useRef, useMemo } from 'react';
import { Globe } from 'lucide-react';
import { Permissions, PermissionTypes } from 'librechat-data-provider';
import ApiKeyDialog from '~/components/SidePanel/Agents/Search/ApiKeyDialog';
import { useLocalize, useHasAccess, useSearchApiKeyForm } from '~/hooks';
import CheckboxButton from '~/components/ui/CheckboxButton';
import { useBadgeRowContext } from '~/Providers';

function WebSearch() {
  const triggerRef = useRef<HTMLInputElement>(null);
  const localize = useLocalize();
  const { webSearch: webSearchData } = useBadgeRowContext();
  const { toggleState: webSearch, debouncedChange, authData } = webSearchData;

  const canUseWebSearch = useHasAccess({
    permissionType: PermissionTypes.WEB_SEARCH,
    permission: Permissions.USE,
  });

  const authTypes = useMemo(() => authData?.authTypes ?? [], [authData?.authTypes]);
  const { methods, onSubmit, isDialogOpen, setIsDialogOpen, handleRevokeApiKey } =
    useSearchApiKeyForm({});

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
        isToolAuthenticated={authData?.authenticated ?? false}
      />
    </>
  );
}

export default memo(WebSearch);
