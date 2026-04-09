import React, { useMemo } from 'react';
import { AuthType } from 'librechat-data-provider';
import SearchApiKeyDialog from '~/components/SidePanel/Agents/Search/ApiKeyDialog';
import CodeApiKeyDialog from '~/components/SidePanel/Agents/Code/ApiKeyDialog';
import { useBadgeRowContext } from '~/Providers';

function ToolDialogs() {
  const context = useBadgeRowContext();
  const { webSearch, codeInterpreter, searchApiKeyForm, codeApiKeyForm } = context ?? {};
  const { authData: webSearchAuthData } = webSearch ?? {};
  const { authData: codeAuthData } = codeInterpreter ?? {};
  const searchAuthTypes = useMemo(
    () => webSearchAuthData?.authTypes ?? [],
    [webSearchAuthData?.authTypes],
  );
  const codeAuthType = useMemo(() => codeAuthData?.message ?? false, [codeAuthData?.message]);

  if (!searchApiKeyForm || !codeApiKeyForm) {
    return null;
  }

  const {
    methods: searchMethods,
    onSubmit: searchOnSubmit,
    isDialogOpen: searchDialogOpen,
    setIsDialogOpen: setSearchDialogOpen,
    handleRevokeApiKey: searchHandleRevoke,
    badgeTriggerRef: searchBadgeTriggerRef,
    menuTriggerRef: searchMenuTriggerRef,
  } = searchApiKeyForm;

  const {
    methods: codeMethods,
    onSubmit: codeOnSubmit,
    isDialogOpen: codeDialogOpen,
    setIsDialogOpen: setCodeDialogOpen,
    handleRevokeApiKey: codeHandleRevoke,
    badgeTriggerRef: codeBadgeTriggerRef,
    menuTriggerRef: codeMenuTriggerRef,
  } = codeApiKeyForm;

  return (
    <>
      <SearchApiKeyDialog
        onSubmit={searchOnSubmit}
        authTypes={searchAuthTypes}
        isOpen={searchDialogOpen}
        onRevoke={searchHandleRevoke}
        register={searchMethods.register}
        onOpenChange={setSearchDialogOpen}
        handleSubmit={searchMethods.handleSubmit}
        triggerRefs={[searchMenuTriggerRef, searchBadgeTriggerRef]}
        isToolAuthenticated={webSearchAuthData?.authenticated ?? false}
      />
      <CodeApiKeyDialog
        onSubmit={codeOnSubmit}
        isOpen={codeDialogOpen}
        onRevoke={codeHandleRevoke}
        register={codeMethods.register}
        onOpenChange={setCodeDialogOpen}
        handleSubmit={codeMethods.handleSubmit}
        triggerRefs={[codeMenuTriggerRef, codeBadgeTriggerRef]}
        isUserProvided={codeAuthType === AuthType.USER_PROVIDED}
        isToolAuthenticated={codeAuthData?.authenticated ?? false}
      />
    </>
  );
}

export default ToolDialogs;
