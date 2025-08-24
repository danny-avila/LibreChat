import React, { useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { Constants } from 'librechat-data-provider';
import { useUpdateUserPluginsMutation } from 'librechat-data-provider/react-query';
import {
  TrashIcon,
  OGDialog,
  OGDialogTrigger,
  Label,
  OGDialogTemplate,
  useToastContext,
} from '@librechat/client';
import type { AgentToolType } from 'librechat-data-provider';
import type { AgentForm } from '~/common';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';
import { useMCPServerManager } from '~/hooks/MCP/useMCPServerManager';
import MCPServerStatusIcon from '~/components/MCP/MCPServerStatusIcon';
import MCPConfigDialog from '~/components/MCP/MCPConfigDialog';

export default function UninitializedMCPTool({
  tool,
  allTools,
}: {
  tool: string;
  allTools?: Record<string, AgentToolType & { tools?: AgentToolType[] }>;
}) {
  const [isHovering, setIsHovering] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const updateUserPlugins = useUpdateUserPluginsMutation();
  const { getValues, setValue } = useFormContext<AgentForm>();
  const { initializeServer, isInitializing, getServerStatusIconProps, getConfigDialogProps } =
    useMCPServerManager();

  if (!allTools) {
    return null;
  }
  const currentTool = allTools[tool];

  const removeTool = (toolId: string) => {
    if (toolId) {
      const mcpToolId = `${toolId}${Constants.mcp_delimiter}${toolId}`;
      const groupObj = currentTool;
      const toolIdsToRemove = [mcpToolId];
      if (groupObj?.tools && groupObj.tools.length > 0) {
        toolIdsToRemove.push(...groupObj.tools.map((sub) => sub.tool_id));
      }
      updateUserPlugins.mutate(
        { pluginKey: mcpToolId, action: 'uninstall', auth: {}, isEntityTool: true },
        {
          onError: (error: unknown) => {
            showToast({
              message: localize('com_ui_delete_tool_error', { error: String(error) }),
              status: 'error',
            });
          },
          onSuccess: () => {
            const remainingToolIds =
              getValues('tools')?.filter((toolId) => !toolIdsToRemove.includes(toolId)) || [];
            setValue('tools', remainingToolIds);
            showToast({ message: localize('com_ui_delete_tool_success'), status: 'success' });
          },
        },
      );
    }
  };

  if (!currentTool) {
    return null;
  }

  const serverName = currentTool.metadata.name;
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
        className="group relative flex w-full items-center gap-1 rounded-lg p-1 text-sm hover:bg-gray-50 dark:hover:bg-gray-800/50"
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
        onFocus={() => setIsFocused(true)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) {
            setIsFocused(false);
          }
        }}
      >
        <button
          type="button"
          className="flex grow cursor-pointer items-center gap-1 rounded bg-transparent p-0 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
          onClick={() => initializeServer(serverName)}
          disabled={isServerInitializing}
        >
          {statusIcon && <div className="flex items-center">{statusIcon}</div>}

          {currentTool.metadata.icon && (
            <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full">
              <div
                className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full bg-center bg-no-repeat dark:bg-white/20"
                style={{
                  backgroundImage: `url(${currentTool.metadata.icon})`,
                  backgroundSize: 'cover',
                }}
              />
            </div>
          )}
          <div
            className="grow px-2 py-1.5"
            style={{ textOverflow: 'ellipsis', wordBreak: 'break-all', overflow: 'hidden' }}
          >
            {currentTool.metadata.name}
            {isServerInitializing && (
              <span className="ml-2 text-xs text-gray-500">{localize('com_ui_initializing')}</span>
            )}
          </div>
        </button>

        <OGDialogTrigger asChild>
          <button
            type="button"
            className={cn(
              'flex h-7 w-7 items-center justify-center rounded transition-all duration-200',
              'hover:bg-gray-200 dark:hover:bg-gray-700',
              'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1',
              'focus:opacity-100',
              isHovering || isFocused ? 'opacity-100' : 'pointer-events-none opacity-0',
            )}
            aria-label={`Delete ${currentTool.metadata.name}`}
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
          selectHandler: () => removeTool(currentTool.tool_id),
          selectClasses:
            'bg-red-700 dark:bg-red-600 hover:bg-red-800 dark:hover:bg-red-800 transition-color duration-200 text-white',
          selectText: localize('com_ui_delete'),
        }}
      />
      {configDialogProps && <MCPConfigDialog {...configDialogProps} />}
    </OGDialog>
  );
}
