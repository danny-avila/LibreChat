import React, { useState, useMemo, useCallback } from 'react';
import * as Ariakit from '@ariakit/react';
import { Settings2, Globe, TerminalSquareIcon } from 'lucide-react';
import { Permissions, PermissionTypes } from 'librechat-data-provider';
import { TooltipAnchor, DropdownPopup } from '~/components';
import { useBadgeRowContext } from '~/Providers';
import { useLocalize, useHasAccess } from '~/hooks';
import type { MenuItemProps } from '~/common';
import { cn } from '~/utils';

interface ToolsDropdownProps {
  disabled?: boolean;
}

const ToolsDropdown = ({ disabled }: ToolsDropdownProps) => {
  const localize = useLocalize();
  const { webSearch, codeInterpreter } = useBadgeRowContext();
  const isDisabled = disabled ?? false;
  const [isPopoverActive, setIsPopoverActive] = useState(false);

  const canUseWebSearch = useHasAccess({
    permissionType: PermissionTypes.WEB_SEARCH,
    permission: Permissions.USE,
  });

  const canRunCode = useHasAccess({
    permissionType: PermissionTypes.RUN_CODE,
    permission: Permissions.USE,
  });

  const handleWebSearchToggle = useCallback(() => {
    const newValue = !webSearch.toggleState;
    webSearch.debouncedChange({ isChecked: newValue });
  }, [webSearch]);

  const handleCodeInterpreterToggle = useCallback(() => {
    const newValue = !codeInterpreter.toggleState;
    codeInterpreter.debouncedChange({ isChecked: newValue });
  }, [codeInterpreter]);

  const dropdownItems = useMemo(() => {
    const items: MenuItemProps[] = [
      {
        render: () => (
          <div className="px-3 py-2 text-xs font-semibold text-text-secondary">
            {localize('com_ui_tools')}
          </div>
        ),
        hideOnClick: false,
      },
    ];

    if (canUseWebSearch) {
      items.push({
        onClick: handleWebSearchToggle,
        hideOnClick: true,
        render: (props) => (
          <div className="flex w-full cursor-pointer items-center justify-between" {...props}>
            <div className="flex items-center gap-2">
              <Globe className="icon-md" />
              <span>{localize('com_ui_web_search')}</span>
            </div>
          </div>
        ),
      });
    }

    if (canRunCode) {
      items.push({
        onClick: handleCodeInterpreterToggle,
        hideOnClick: true,
        render: (props) => (
          <div className="flex w-full cursor-pointer items-center justify-between" {...props}>
            <div className="flex items-center gap-2">
              <TerminalSquareIcon className="icon-md" />
              <span>{localize('com_assistants_code_interpreter')}</span>
            </div>
          </div>
        ),
      });
    }

    return items;
  }, [canUseWebSearch, canRunCode, localize, handleWebSearchToggle, handleCodeInterpreterToggle]);

  const menuTrigger = (
    <TooltipAnchor
      render={
        <Ariakit.MenuButton
          disabled={isDisabled}
          id="tools-dropdown-button"
          aria-label="Tools Options"
          className={cn(
            'flex size-9 items-center justify-center rounded-full p-1 transition-colors hover:bg-surface-hover focus:outline-none focus:ring-2 focus:ring-primary focus:ring-opacity-50',
          )}
        >
          <div className="flex w-full items-center justify-center gap-2">
            <Settings2 className="icon-md" />
          </div>
        </Ariakit.MenuButton>
      }
      id="tools-dropdown-button"
      description={localize('com_ui_tools')}
      disabled={isDisabled}
    />
  );

  return (
    <DropdownPopup
      menuId="tools-dropdown-menu"
      isOpen={isPopoverActive}
      setIsOpen={setIsPopoverActive}
      modal={true}
      unmountOnHide={true}
      trigger={menuTrigger}
      items={dropdownItems}
      iconClassName="mr-0"
    />
  );
};

export default React.memo(ToolsDropdown);
