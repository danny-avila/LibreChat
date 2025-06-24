import React, { useState, useMemo, useCallback } from 'react';
import * as Ariakit from '@ariakit/react';
import { Globe, Settings, Settings2, TerminalSquareIcon } from 'lucide-react';
import type { MenuItemProps } from '~/common';
import { Permissions, PermissionTypes, AuthType } from 'librechat-data-provider';
import { TooltipAnchor, DropdownPopup } from '~/components';
import MCPSubMenu from '~/components/Chat/Input/MCPSubMenu';
import { PinIcon, VectorIcon } from '~/components/svg';
import { useLocalize, useHasAccess } from '~/hooks';
import { useBadgeRowContext } from '~/Providers';
import { cn } from '~/utils';

interface ToolsDropdownProps {
  disabled?: boolean;
}

const ToolsDropdown = ({ disabled }: ToolsDropdownProps) => {
  const localize = useLocalize();
  const isDisabled = disabled ?? false;
  const [isPopoverActive, setIsPopoverActive] = useState(false);
  const {
    webSearch,
    mcpSelect,
    fileSearch,
    startupConfig,
    codeApiKeyForm,
    codeInterpreter,
    searchApiKeyForm,
  } = useBadgeRowContext();
  const { setIsDialogOpen: setIsCodeDialogOpen, menuTriggerRef: codeMenuTriggerRef } =
    codeApiKeyForm;
  const { setIsDialogOpen: setIsSearchDialogOpen, menuTriggerRef: searchMenuTriggerRef } =
    searchApiKeyForm;
  const {
    isPinned: isSearchPinned,
    setIsPinned: setIsSearchPinned,
    authData: webSearchAuthData,
  } = webSearch;
  const {
    isPinned: isCodePinned,
    setIsPinned: setIsCodePinned,
    authData: codeAuthData,
  } = codeInterpreter;
  const { isPinned: isFileSearchPinned, setIsPinned: setIsFileSearchPinned } = fileSearch;
  const {
    mcpValues,
    mcpServerNames,
    isPinned: isMCPPinned,
    setIsPinned: setIsMCPPinned,
  } = mcpSelect;

  const canUseWebSearch = useHasAccess({
    permissionType: PermissionTypes.WEB_SEARCH,
    permission: Permissions.USE,
  });

  const canRunCode = useHasAccess({
    permissionType: PermissionTypes.RUN_CODE,
    permission: Permissions.USE,
  });

  const showWebSearchSettings = useMemo(() => {
    const authTypes = webSearchAuthData?.authTypes ?? [];
    if (authTypes.length === 0) return true;
    return !authTypes.every(([, authType]) => authType === AuthType.SYSTEM_DEFINED);
  }, [webSearchAuthData?.authTypes]);

  const showCodeSettings = useMemo(
    () => codeAuthData?.message !== AuthType.SYSTEM_DEFINED,
    [codeAuthData?.message],
  );

  const handleWebSearchToggle = useCallback(() => {
    const newValue = !webSearch.toggleState;
    webSearch.debouncedChange({ isChecked: newValue });
  }, [webSearch]);

  const handleCodeInterpreterToggle = useCallback(() => {
    const newValue = !codeInterpreter.toggleState;
    codeInterpreter.debouncedChange({ isChecked: newValue });
  }, [codeInterpreter]);

  const handleFileSearchToggle = useCallback(() => {
    const newValue = !fileSearch.toggleState;
    fileSearch.debouncedChange({ isChecked: newValue });
  }, [fileSearch]);

  const handleMCPToggle = useCallback(
    (serverName: string) => {
      const currentValues = mcpSelect.mcpValues ?? [];
      const newValues = currentValues.includes(serverName)
        ? currentValues.filter((v) => v !== serverName)
        : [...currentValues, serverName];
      mcpSelect.setMCPValues(newValues);
    },
    [mcpSelect],
  );

  const mcpPlaceholder = startupConfig?.interface?.mcpServers?.placeholder;

  const dropdownItems = useMemo(() => {
    const items: MenuItemProps[] = [];
    items.push({
      onClick: handleFileSearchToggle,
      hideOnClick: false,
      render: (props) => (
        <div {...props}>
          <div className="flex items-center gap-2">
            <VectorIcon className="icon-md" />
            <span>{localize('com_assistants_file_search')}</span>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsFileSearchPinned(!isFileSearchPinned);
            }}
            className={cn(
              'rounded p-1 transition-all duration-200',
              'hover:bg-surface-secondary hover:shadow-sm',
              !isFileSearchPinned && 'text-text-secondary hover:text-text-primary',
            )}
            aria-label={isFileSearchPinned ? 'Unpin' : 'Pin'}
          >
            <div className="h-4 w-4">
              <PinIcon unpin={isFileSearchPinned} />
            </div>
          </button>
        </div>
      ),
    });

    if (canUseWebSearch) {
      items.push({
        onClick: handleWebSearchToggle,
        hideOnClick: false,
        render: (props) => (
          <div {...props}>
            <div className="flex items-center gap-2">
              <Globe className="icon-md" />
              <span>{localize('com_ui_web_search')}</span>
            </div>
            <div className="flex items-center gap-1">
              {showWebSearchSettings && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsSearchDialogOpen(true);
                  }}
                  className={cn(
                    'rounded p-1 transition-all duration-200',
                    'hover:bg-surface-secondary hover:shadow-sm',
                    'text-text-secondary hover:text-text-primary',
                  )}
                  aria-label="Configure web search"
                  ref={searchMenuTriggerRef}
                >
                  <div className="h-4 w-4">
                    <Settings className="h-4 w-4" />
                  </div>
                </button>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsSearchPinned(!isSearchPinned);
                }}
                className={cn(
                  'rounded p-1 transition-all duration-200',
                  'hover:bg-surface-secondary hover:shadow-sm',
                  !isSearchPinned && 'text-text-secondary hover:text-text-primary',
                )}
                aria-label={isSearchPinned ? 'Unpin' : 'Pin'}
              >
                <div className="h-4 w-4">
                  <PinIcon unpin={isSearchPinned} />
                </div>
              </button>
            </div>
          </div>
        ),
      });
    }

    if (canRunCode) {
      items.push({
        onClick: handleCodeInterpreterToggle,
        hideOnClick: false,
        render: (props) => (
          <div {...props}>
            <div className="flex items-center gap-2">
              <TerminalSquareIcon className="icon-md" />
              <span>{localize('com_assistants_code_interpreter')}</span>
            </div>
            <div className="flex items-center gap-1">
              {showCodeSettings && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsCodeDialogOpen(true);
                  }}
                  ref={codeMenuTriggerRef}
                  className={cn(
                    'rounded p-1 transition-all duration-200',
                    'hover:bg-surface-secondary hover:shadow-sm',
                    'text-text-secondary hover:text-text-primary',
                  )}
                  aria-label="Configure code interpreter"
                >
                  <div className="h-4 w-4">
                    <Settings className="h-4 w-4" />
                  </div>
                </button>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsCodePinned(!isCodePinned);
                }}
                className={cn(
                  'rounded p-1 transition-all duration-200',
                  'hover:bg-surface-secondary hover:shadow-sm',
                  !isCodePinned && 'text-text-primary hover:text-text-primary',
                )}
                aria-label={isCodePinned ? 'Unpin' : 'Pin'}
              >
                <div className="h-4 w-4">
                  <PinIcon unpin={isCodePinned} />
                </div>
              </button>
            </div>
          </div>
        ),
      });
    }

    if (mcpServerNames && mcpServerNames.length > 0) {
      items.push({
        hideOnClick: false,
        render: (props) => (
          <MCPSubMenu
            {...props}
            mcpValues={mcpValues}
            isMCPPinned={isMCPPinned}
            placeholder={mcpPlaceholder}
            mcpServerNames={mcpServerNames}
            setIsMCPPinned={setIsMCPPinned}
            handleMCPToggle={handleMCPToggle}
          />
        ),
      });
    }

    return items;
  }, [
    localize,
    mcpValues,
    canRunCode,
    isMCPPinned,
    isCodePinned,
    mcpPlaceholder,
    mcpServerNames,
    isSearchPinned,
    setIsMCPPinned,
    canUseWebSearch,
    setIsCodePinned,
    handleMCPToggle,
    showCodeSettings,
    setIsSearchPinned,
    isFileSearchPinned,
    codeMenuTriggerRef,
    setIsCodeDialogOpen,
    searchMenuTriggerRef,
    showWebSearchSettings,
    setIsFileSearchPinned,
    handleWebSearchToggle,
    setIsSearchDialogOpen,
    handleFileSearchToggle,
    handleCodeInterpreterToggle,
  ]);

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
      itemClassName="flex w-full cursor-pointer items-center justify-between hover:bg-surface-hover gap-5"
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
