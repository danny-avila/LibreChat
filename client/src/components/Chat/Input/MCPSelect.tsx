import React, { memo, useCallback } from 'react';
import { PermissionTypes, Permissions } from 'librechat-data-provider';
import { MultiSelect, MCPIcon } from '@librechat/client';
import MCPServerStatusIcon from '~/components/MCP/MCPServerStatusIcon';
import MCPConfigDialog from '~/components/MCP/MCPConfigDialog';
import { useBadgeRowContext } from '~/Providers';
import { useHasAccess } from '~/hooks';
import { cn } from '~/utils';

function MCPSelectContent() {
  const { conversationId, mcpServerManager } = useBadgeRowContext();
  const {
    localize,
    isPinned,
    mcpValues,
    isInitializing,
    placeholderText,
    batchToggleServers,
    getConfigDialogProps,
    getServerStatusIconProps,
    selectableServers,
  } = mcpServerManager;

  const renderSelectedValues = useCallback(
    (
      values: string[],
      placeholder?: string,
      items?: (string | { label: string; value: string })[],
    ) => {
      if (values.length === 0) {
        return placeholder || localize('com_ui_select_placeholder');
      }
      if (values.length === 1) {
        const selectedItem = items?.find((i) => typeof i !== 'string' && i.value == values[0]);
        return selectedItem && typeof selectedItem !== 'string' ? selectedItem.label : values[0];
      }
      return localize('com_ui_x_selected', { 0: values.length });
    },
    [localize],
  );

  const renderItemContent = useCallback(
    (serverName: string, defaultContent: React.ReactNode) => {
      const statusIconProps = getServerStatusIconProps(serverName);
      const isServerInitializing = isInitializing(serverName);

      /**
       Common wrapper for the main content (check mark + text).
       Ensures Check & Text are adjacent and the group takes available space.
        */
      const mainContentWrapper = (
        <button
          type="button"
          className={`flex flex-grow items-center rounded bg-transparent p-0 text-left transition-colors focus:outline-none ${
            isServerInitializing ? 'opacity-50' : ''
          }`}
          tabIndex={0}
          disabled={isServerInitializing}
        >
          {defaultContent}
        </button>
      );

      const statusIcon = statusIconProps && <MCPServerStatusIcon {...statusIconProps} />;

      if (statusIcon) {
        return (
          <div className="flex w-full items-center justify-between">
            {mainContentWrapper}
            <div className="ml-2 flex items-center">{statusIcon}</div>
          </div>
        );
      }

      return mainContentWrapper;
    },
    [getServerStatusIconProps, isInitializing],
  );

  if (!isPinned && mcpValues?.length === 0) {
    return null;
  }

  const configDialogProps = getConfigDialogProps();
  return (
    <>
      <MultiSelect
        items={selectableServers.map((s) => ({
          label: s.config.title || s.serverName,
          value: s.serverName,
        }))}
        selectedValues={mcpValues ?? []}
        setSelectedValues={batchToggleServers}
        renderSelectedValues={renderSelectedValues}
        renderItemContent={renderItemContent}
        placeholder={placeholderText}
        popoverClassName="min-w-fit"
        className="badge-icon min-w-fit"
        selectIcon={<MCPIcon className="icon-md text-text-primary" />}
        selectItemsClassName="border border-blue-600/50 bg-blue-500/10 hover:bg-blue-700/10"
        selectClassName={cn(
          'group relative inline-flex items-center justify-center md:justify-start gap-1.5 rounded-full border border-border-medium text-sm font-medium transition-all',
          'md:w-full size-9 p-2 md:p-3 bg-transparent shadow-sm hover:bg-surface-hover hover:shadow-md active:shadow-inner',
        )}
      />
      {configDialogProps && (
        <MCPConfigDialog {...configDialogProps} conversationId={conversationId} />
      )}
    </>
  );
}

function MCPSelect() {
  const { mcpServerManager } = useBadgeRowContext();
  const { selectableServers } = mcpServerManager;
  const canUseMcp = useHasAccess({
    permissionType: PermissionTypes.MCP_SERVERS,
    permission: Permissions.USE,
  });

  if (!canUseMcp || !selectableServers || selectableServers.length === 0) {
    return null;
  }

  return <MCPSelectContent />;
}

export default memo(MCPSelect);
