import React, { memo } from 'react';
import { Globe } from 'lucide-react';
import { CheckboxButton } from '@librechat/client';
import { Permissions, PermissionTypes } from 'librechat-data-provider';
import { useLocalize, useHasAccess } from '~/hooks';
import { useBadgeRowContext } from '~/Providers';

/**
 * BKL fork: the web-search badge is rendered unconditionally whenever the user
 * has permission to use web search. Upstream LibreChat gates it behind
 * `isPinned || (toggled && authenticated)` to keep the input row clean when
 * the feature is unused — but for the BKL endpoint web search is a first-class
 * action (it maps to Claude's native `web_search_20250305` tool and needs no
 * extra configuration), so the "pin, then click to activate" two-step was
 * causing confusion. Clicking the badge directly toggles on/off now.
 */
function WebSearch() {
  const localize = useLocalize();
  const { webSearch: webSearchData, searchApiKeyForm } = useBadgeRowContext();
  const { toggleState: webSearch, debouncedChange } = webSearchData;
  const { badgeTriggerRef } = searchApiKeyForm;

  const canUseWebSearch = useHasAccess({
    permissionType: PermissionTypes.WEB_SEARCH,
    permission: Permissions.USE,
  });

  if (!canUseWebSearch) {
    return null;
  }

  return (
    <CheckboxButton
      ref={badgeTriggerRef}
      className="max-w-fit"
      checked={webSearch}
      setValue={debouncedChange}
      label={localize('com_ui_search')}
      isCheckedClassName="border-blue-600/40 bg-blue-500/10 hover:bg-blue-700/10"
      icon={<Globe className="icon-md" aria-hidden="true" />}
    />
  );
}

export default memo(WebSearch);
