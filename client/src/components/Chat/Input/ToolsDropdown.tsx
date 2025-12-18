import React, { useState, useMemo, useCallback } from 'react';
import * as Ariakit from '@ariakit/react';
import { Globe, Settings, Settings2, TerminalSquareIcon } from 'lucide-react';
import { TooltipAnchor, DropdownPopup, PinIcon, VectorIcon } from '@librechat/client';
import type { MenuItemProps } from '~/common';
import {
  AuthType,
  Permissions,
  ArtifactModes,
  PermissionTypes,
  defaultAgentCapabilities,
} from 'librechat-data-provider';
import { useLocalize, useHasAccess, useAgentCapabilities } from '~/hooks';
import ArtifactsSubMenu from '~/components/Chat/Input/ArtifactsSubMenu';
import MCPSubMenu from '~/components/Chat/Input/MCPSubMenu';
import { useGetStartupConfig } from '~/data-provider';
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
    artifacts,
    fileSearch,
    agentsConfig,
    mcpServerManager,
    codeApiKeyForm,
    codeInterpreter,
    searchApiKeyForm,
  } = useBadgeRowContext();
  const { data: startupConfig } = useGetStartupConfig();

  const { codeEnabled, webSearchEnabled, artifactsEnabled, fileSearchEnabled } =
    useAgentCapabilities(agentsConfig?.capabilities ?? defaultAgentCapabilities);

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
  const { isPinned: isArtifactsPinned, setIsPinned: setIsArtifactsPinned } = artifacts;

  const canUseWebSearch = useHasAccess({
    permissionType: PermissionTypes.WEB_SEARCH,
    permission: Permissions.USE,
  });

  const canRunCode = useHasAccess({
    permissionType: PermissionTypes.RUN_CODE,
    permission: Permissions.USE,
  });

  const canUseFileSearch = useHasAccess({
    permissionType: PermissionTypes.FILE_SEARCH,
    permission: Permissions.USE,
  });

  const canUseMcp = useHasAccess({
    permissionType: PermissionTypes.MCP_SERVERS,
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
    webSearch.debouncedChange({ value: newValue });
  }, [webSearch]);

  const handleCodeInterpreterToggle = useCallback(() => {
    const newValue = !codeInterpreter.toggleState;
    codeInterpreter.debouncedChange({ value: newValue });
  }, [codeInterpreter]);

  const handleFileSearchToggle = useCallback(() => {
    const newValue = !fileSearch.toggleState;
    fileSearch.debouncedChange({ value: newValue });
  }, [fileSearch]);

  const handleArtifactsToggle = useCallback(() => {
    const currentState = artifacts.toggleState;
    if (!currentState || currentState === '') {
      artifacts.debouncedChange({ value: ArtifactModes.DEFAULT });
    } else {
      artifacts.debouncedChange({ value: '' });
    }
  }, [artifacts]);

  const handleShadcnToggle = useCallback(() => {
    const currentState = artifacts.toggleState;
    if (currentState === ArtifactModes.SHADCNUI) {
      artifacts.debouncedChange({ value: ArtifactModes.DEFAULT });
    } else {
      artifacts.debouncedChange({ value: ArtifactModes.SHADCNUI });
    }
  }, [artifacts]);

  const handleCustomToggle = useCallback(() => {
    const currentState = artifacts.toggleState;
    if (currentState === ArtifactModes.CUSTOM) {
      artifacts.debouncedChange({ value: ArtifactModes.DEFAULT });
    } else {
      artifacts.debouncedChange({ value: ArtifactModes.CUSTOM });
    }
  }, [artifacts]);

  const mcpPlaceholder = startupConfig?.interface?.mcpServers?.placeholder;

  const dropdownItems: MenuItemProps[] = [];

  if (fileSearchEnabled && canUseFileSearch) {
    dropdownItems.push({
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
  }

  if (canUseWebSearch && webSearchEnabled) {
    dropdownItems.push({
      onClick: handleWebSearchToggle,
      hideOnClick: false,
      render: (props) => (
        <div {...props}>
          <div className="flex items-center gap-2">
            <Globe className="icon-md" aria-hidden="true" />
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
                  <Settings className="h-4 w-4" aria-hidden="true" />
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

  if (canRunCode && codeEnabled) {
    dropdownItems.push({
      onClick: handleCodeInterpreterToggle,
      hideOnClick: false,
      render: (props) => (
        <div {...props}>
          <div className="flex items-center gap-2">
            <TerminalSquareIcon className="icon-md" aria-hidden="true" />
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
                  <Settings className="h-4 w-4" aria-hidden="true" />
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

  if (artifactsEnabled) {
    dropdownItems.push({
      hideOnClick: false,
      render: (props) => (
        <ArtifactsSubMenu
          {...props}
          isArtifactsPinned={isArtifactsPinned}
          setIsArtifactsPinned={setIsArtifactsPinned}
          artifactsMode={artifacts.toggleState as string}
          handleArtifactsToggle={handleArtifactsToggle}
          handleShadcnToggle={handleShadcnToggle}
          handleCustomToggle={handleCustomToggle}
        />
      ),
    });
  }

  const { availableMCPServers } = mcpServerManager;
  if (canUseMcp && availableMCPServers && availableMCPServers.length > 0) {
    dropdownItems.push({
      hideOnClick: false,
      render: (props) => <MCPSubMenu {...props} placeholder={mcpPlaceholder} />,
    });
  }

  if (dropdownItems.length === 0) {
    return null;
  }

  const menuTrigger = (
    <TooltipAnchor
      render={
        <Ariakit.MenuButton
          disabled={isDisabled}
          id="tools-dropdown-button"
          aria-label="Tools Options"
          className={cn(
            'flex size-9 items-center justify-center rounded-full p-1 transition-colors hover:bg-surface-hover focus:outline-none focus:ring-2 focus:ring-primary focus:ring-opacity-50',
            isPopoverActive && 'bg-surface-hover',
          )}
        >
          <div className="flex w-full items-center justify-center gap-2">
            <Settings2 className="size-5" aria-hidden="true" />
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
      itemClassName="flex w-full cursor-pointer rounded-lg items-center justify-between hover:bg-surface-hover gap-5"
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
