import React, { memo } from 'react';
import { Globe } from 'lucide-react';
import { CheckboxButton } from '@librechat/client';
import { LocalStorageKeys, Permissions, PermissionTypes } from 'librechat-data-provider';
import { useLocalize, useSetIndexOptions, useHasAccess } from '~/hooks';
import useLocalStorage from '~/hooks/useLocalStorageAlt';
import { useChatContext } from '~/Providers/ChatContext';

function NativeWebSearch() {
  const localize = useLocalize();
  const { setOption } = useSetIndexOptions();
  const { conversation } = useChatContext();
  const [isPinned] = useLocalStorage<boolean>(
    `${LocalStorageKeys.LAST_NATIVE_WEB_SEARCH_TOGGLE_}pinned`,
    false,
  );

  // Only show native web search if user doesn't have permission for authenticated web search
  const canUseWebSearch = useHasAccess({
    permissionType: PermissionTypes.WEB_SEARCH,
    permission: Permissions.USE,
  });

  // Don't render if user has access to authenticated web search
  if (canUseWebSearch) {
    return null;
  }

  // Use conversation.web_search as the single source of truth
  const webSearchEnabled = conversation?.web_search ?? false;

  // Don't render if not enabled and not pinned
  if (!webSearchEnabled && !isPinned) {
    return null;
  }

  const handleChange = (values: {
    e?: React.ChangeEvent<HTMLInputElement>;
    value: string | boolean;
  }) => {
    const checked = typeof values.value === 'boolean' ? values.value : values.value === 'true';
    setOption('web_search')(checked);
  };

  return (
    <CheckboxButton
      className="max-w-fit"
      checked={webSearchEnabled}
      setValue={handleChange}
      label={localize('com_ui_web_search')}
      isCheckedClassName="border-purple-600/40 bg-purple-500/10 hover:bg-purple-700/10"
      icon={<Globe className="icon-md" />}
    />
  );
}

export default memo(NativeWebSearch);
