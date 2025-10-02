import React, { memo } from 'react';
import { Globe } from 'lucide-react';
import { CheckboxButton } from '@librechat/client';
import { Permissions, PermissionTypes, tConvoUpdateSchema } from 'librechat-data-provider';
import { useLocalize, useHasAccess } from '~/hooks';
import { useBadgeRowContext, useChatContext } from '~/Providers';
import { useGetStartupConfig } from '~/data-provider';

function WebSearch() {
  const localize = useLocalize();
  const { webSearch: webSearchData, searchApiKeyForm } = useBadgeRowContext();
  const { toggleState: webSearch, handleChange, isPinned, authData } = webSearchData;
  const { badgeTriggerRef } = searchApiKeyForm;
  const { data: startupConfig } = useGetStartupConfig();
  const { conversation, setConversation } = useChatContext();

  const canUseWebSearch = useHasAccess({
    permissionType: PermissionTypes.WEB_SEARCH,
    permission: Permissions.USE,
  });

  const isNativeMode = startupConfig?.webSearch?.mode === 'native';
  const isAuthenticated = authData?.authenticated;
  const hasServerSideConfig = !!startupConfig?.webSearch && !isNativeMode;
  const handleWebSearchToggle = (valueOrObject: boolean | { e?: React.ChangeEvent<HTMLInputElement>; value: boolean }) => {
    const value = typeof valueOrObject === 'boolean' ? valueOrObject : valueOrObject.value;
    if (isNativeMode && conversation && setConversation) {
      setConversation(
        tConvoUpdateSchema.parse({
          ...conversation,
          web_search: value,
        })
      );
    }
    else if (isAuthenticated || hasServerSideConfig) {
      handleChange({ value });
      }
  };

  if (!canUseWebSearch) {
    return null;
  }
  const shouldShowBadge = isPinned || 
    (isNativeMode && conversation?.web_search) ||
    (webSearch && (isAuthenticated || hasServerSideConfig));

  const isChecked = isNativeMode ? (conversation?.web_search || false) : webSearch;
  return (
    shouldShowBadge && (
      <CheckboxButton
        ref={badgeTriggerRef}
        className="max-w-fit"
        checked={isChecked}
        setValue={handleWebSearchToggle}
        label={localize('com_ui_search')}
        isCheckedClassName="border-blue-600/40 bg-blue-500/10 hover:bg-blue-700/10"
        icon={<Globe className="icon-md" />}
      />
    )
  );
}

export default memo(WebSearch);
