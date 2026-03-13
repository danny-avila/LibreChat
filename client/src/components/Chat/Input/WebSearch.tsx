import React, { memo } from 'react';
import { Globe } from 'lucide-react';
import { CheckboxButton } from '@librechat/client';
import { Permissions, PermissionTypes, defaultAgentCapabilities } from 'librechat-data-provider';
import { useLocalize, useHasAccess, useAgentCapabilities } from '~/hooks';
import { useBadgeRowContext } from '~/Providers';

function WebSearch() {
  const localize = useLocalize();
  const { webSearch: webSearchData, searchApiKeyForm, agentsConfig } = useBadgeRowContext();
  const { toggleState: webSearch, debouncedChange } = webSearchData;
  const { badgeTriggerRef } = searchApiKeyForm;
  const { webSearchEnabled } = useAgentCapabilities(
    agentsConfig?.capabilities ?? defaultAgentCapabilities,
  );

  const canUseWebSearch = useHasAccess({
    permissionType: PermissionTypes.WEB_SEARCH,
    permission: Permissions.USE,
  });

  if (!canUseWebSearch || !webSearchEnabled) {
    return null;
  }

  return (
    <CheckboxButton
      ref={badgeTriggerRef}
      className="max-w-fit"
      checked={webSearch}
      setValue={debouncedChange}
      label={localize('com_ui_web_search')}
      isCheckedClassName="border-blue-600/40 bg-blue-500/10 hover:bg-blue-700/10"
      icon={<Globe className="icon-md" aria-hidden="true" />}
    />
  );
}

export default memo(WebSearch);
