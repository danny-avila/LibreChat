import React, { useState } from 'react';
import { Label, OGDialog, TrashIcon, OGDialogTrigger, OGDialogTemplate } from '@librechat/client';
import type { MCPServerInfo } from '~/common';
import { useLocalize, useMCPServerManager, useRemoveMCPTool } from '~/hooks';
import MCPServerStatusIcon from '~/components/MCP/MCPServerStatusIcon';
import MCPConfigDialog from '~/components/MCP/MCPConfigDialog';
import { cn } from '~/utils';

export default function UninitializedMCPTool({ serverInfo }: { serverInfo?: MCPServerInfo }) {
  const localize = useLocalize();
  const { removeTool } = useRemoveMCPTool();

  const [isFocused, setIsFocused] = useState(false);
  const [isHovering, setIsHovering] = useState(false);

  const { initializeServer, isInitializing, getServerStatusIconProps, getConfigDialogProps } =
    useMCPServerManager();

  if (!serverInfo) {
    return null;
  }

  const serverName = serverInfo.serverName;
  const isServerInitializing = isInitializing(serverName);
  const statusIconProps = getServerStatusIconProps(serverName);
  const configDialogProps = getConfigDialogProps();

  const statusIcon = statusIconProps && (
    <div
      onClick={(e) => {
        e.stopPropagation();
      }}
      className="cursor-pointer rounded p-0.5 hover:bg-surface-secondary"
    >
      <MCPServerStatusIcon {...statusIconProps} />
    </div>
  );

  return (
    <OGDialog>
      <div
        className="group relative flex w-full items-center gap-1 rounded-lg p-1 text-sm hover:bg-surface-primary-alt"
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
        onFocus={() => setIsFocused(true)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) {
            setIsFocused(false);
          }
        }}
      >
        <div
          className="flex grow cursor-pointer items-center gap-1 rounded bg-transparent p-0 text-left transition-colors"
          onClick={(e) => {
            if ((e.target as HTMLElement).closest('[data-status-icon]')) {
              return;
            }
            if (!isServerInitializing) {
              initializeServer(serverName);
            }
          }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              if (!isServerInitializing) {
                initializeServer(serverName);
              }
            }
          }}
          aria-disabled={isServerInitializing}
        >
          {statusIcon && (
            <div className="flex items-center" data-status-icon>
              {statusIcon}
            </div>
          )}

          {serverInfo.metadata.icon && (
            <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full">
              <div
                className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full bg-center bg-no-repeat dark:bg-white/20"
                style={{
                  backgroundImage: `url(${serverInfo.metadata.icon})`,
                  backgroundSize: 'cover',
                }}
              />
            </div>
          )}
          <div
            className="grow px-2 py-1.5"
            style={{ textOverflow: 'ellipsis', wordBreak: 'break-all', overflow: 'hidden' }}
          >
            {serverName}
            {isServerInitializing && (
              <span className="ml-2 text-xs text-text-secondary">
                {localize('com_ui_initializing')}
              </span>
            )}
          </div>
        </div>

        <OGDialogTrigger asChild>
          <button
            type="button"
            className={cn(
              'flex h-7 w-7 items-center justify-center rounded transition-all duration-200 hover:bg-surface-active-alt focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1',
              isHovering || isFocused ? 'opacity-100' : 'pointer-events-none opacity-0',
            )}
            aria-label={`Delete ${serverName}`}
            tabIndex={0}
            onFocus={() => setIsFocused(true)}
          >
            <TrashIcon className="h-4 w-4" />
          </button>
        </OGDialogTrigger>
      </div>
      <OGDialogTemplate
        showCloseButton={false}
        title={localize('com_ui_delete_tool')}
        mainClassName="px-0"
        className="max-w-[450px]"
        main={
          <Label className="text-left text-sm font-medium">
            {localize('com_ui_delete_tool_confirm')}
          </Label>
        }
        selection={{
          selectHandler: () => removeTool(serverName),
          selectClasses:
            'bg-red-700 dark:bg-red-600 hover:bg-red-800 dark:hover:bg-red-800 transition-color duration-200 text-white',
          selectText: localize('com_ui_delete'),
        }}
      />
      {configDialogProps && <MCPConfigDialog {...configDialogProps} />}
    </OGDialog>
  );
}
