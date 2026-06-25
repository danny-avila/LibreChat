import { useFormContext } from 'react-hook-form';
import { Checkbox } from '@librechat/client';
import { Constants } from 'librechat-data-provider';
import type { AgentForm } from '~/common';
import type { TranslationKeys } from '~/hooks/useLocalize';
import type { McpItem } from '../../items/types';
import MCPToolItem from '../../../MCPToolItem';
import MCPConfigDialog from '~/components/MCP/MCPConfigDialog';
import MCPServerStatusIcon from '~/components/MCP/MCPServerStatusIcon';
import { useAgentPanelContext } from '~/Providers';
import {
  useAgentCapabilities,
  useGetAgentsConfig,
  useMCPServerManager,
  useMCPToolOptions,
} from '~/hooks';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

interface StatusDisplay {
  labelKey: TranslationKeys;
  dotClass: string;
}

function getStatusDisplay(
  connectionState: string | undefined,
  isInitializing: boolean,
  isConfigured: boolean,
): StatusDisplay {
  if (isInitializing || connectionState === 'connecting') {
    return {
      labelKey: 'com_nav_mcp_status_initializing',
      dotClass: 'bg-blue-500 animate-pulse',
    };
  }
  if (connectionState === 'connected') {
    return { labelKey: 'com_nav_mcp_status_connected', dotClass: 'bg-emerald-500' };
  }
  if (connectionState === 'error') {
    return { labelKey: 'com_nav_mcp_status_error', dotClass: 'bg-red-500' };
  }
  if (connectionState === 'disconnected') {
    return { labelKey: 'com_nav_mcp_status_disconnected', dotClass: 'bg-amber-500' };
  }
  if (!isConfigured) {
    return { labelKey: 'com_ui_tools_mcp_status_unconfigured', dotClass: 'bg-gray-400' };
  }
  return { labelKey: 'com_nav_mcp_status_unknown', dotClass: 'bg-gray-400' };
}

interface Props {
  item: McpItem;
}

export default function McpSection({ item }: Props) {
  const localize = useLocalize();
  const { getValues, setValue } = useFormContext<AgentForm>();
  const { getServerStatusIconProps, getConfigDialogProps } = useMCPServerManager();
  const { mcpServersMap } = useAgentPanelContext();
  const { agentsConfig } = useGetAgentsConfig();
  const { deferredToolsEnabled, programmaticToolsEnabled } = useAgentCapabilities(
    agentsConfig?.capabilities,
  );
  const { isToolDeferred, isToolProgrammatic, toggleToolDefer, toggleToolProgrammatic } =
    useMCPToolOptions();

  const serverName = item.server.serverName;
  const serverToken = `${Constants.mcp_server}${Constants.mcp_delimiter}${serverName}`;
  /** Live server data — `item.server` is a snapshot from card click and goes stale once
   * the MCP query refetches (e.g., after a server connects), so read from the live map. */
  const liveServer = mcpServersMap.get(serverName) ?? item.server;
  const tools = liveServer.tools ?? [];
  const hasTools = tools.length > 0;

  const getSelectedTools = (): string[] => {
    const formTools = (getValues('tools') ?? []) as string[];
    return tools.filter((t) => formTools.includes(t.tool_id)).map((t) => t.tool_id);
  };

  /** Replace this server's selection. Strips every tool_id AND the server-level
   * placeholder token, so passing `[]` fully detaches the server. */
  const updateFormTools = (next: string[]) => {
    const current = (getValues('tools') ?? []) as string[];
    const otherTools = current.filter(
      (t) => t !== serverToken && !tools.some((st) => st.tool_id === t),
    );
    setValue('tools', [...otherTools, ...next], { shouldDirty: true });
  };

  const toggleToolSelect = (toolId: string) => {
    const selected = getSelectedTools();
    const next = selected.includes(toolId)
      ? selected.filter((t) => t !== toolId)
      : [...selected, toolId];
    updateFormTools(next);
  };

  const toggleAll = (checked: boolean) => {
    updateFormTools(checked ? tools.map((t) => t.tool_id) : []);
  };

  const selectedTools = getSelectedTools();
  const allSelected = hasTools && selectedTools.length === tools.length;
  const statusIconProps = getServerStatusIconProps(serverName);
  const configDialogProps = getConfigDialogProps();
  const statusDisplay = getStatusDisplay(
    statusIconProps?.serverStatus?.connectionState,
    statusIconProps?.isInitializing ?? false,
    liveServer.isConfigured,
  );

  return (
    <div className="flex flex-col gap-5">
      {item.description && (
        <p className="text-sm leading-relaxed text-text-secondary">{item.description}</p>
      )}

      <div className="flex items-center justify-between rounded-xl border border-border-light bg-surface-secondary px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span
            className={cn('size-2.5 rounded-full', statusDisplay.dotClass)}
            aria-hidden="true"
          />
          <span className="text-sm font-medium text-text-primary">
            {localize(statusDisplay.labelKey)}
          </span>
        </div>
        {statusIconProps && <MCPServerStatusIcon {...statusIconProps} />}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium uppercase tracking-wide text-text-secondary">
            {localize('com_ui_tools_mcp_tools_section')}
          </span>
          {hasTools && (
            <label className="flex cursor-pointer items-center gap-2 text-xs text-text-secondary">
              <Checkbox
                checked={allSelected}
                onCheckedChange={(checked) => toggleAll(checked === true)}
                aria-label={
                  allSelected
                    ? localize('com_ui_tools_mcp_deselect_all')
                    : localize('com_ui_tools_mcp_select_all')
                }
                className="size-4 rounded border border-border-medium"
              />
              <span>
                {allSelected
                  ? localize('com_ui_tools_mcp_deselect_all')
                  : localize('com_ui_tools_mcp_select_all')}
              </span>
            </label>
          )}
        </div>
        {hasTools ? (
          <div className="flex flex-col gap-1">
            {tools.map((tool) => (
              <MCPToolItem
                key={tool.tool_id}
                tool={tool}
                isSelected={selectedTools.includes(tool.tool_id)}
                isDeferred={deferredToolsEnabled && isToolDeferred(tool.tool_id)}
                isProgrammatic={programmaticToolsEnabled && isToolProgrammatic(tool.tool_id)}
                deferredToolsEnabled={deferredToolsEnabled}
                programmaticToolsEnabled={programmaticToolsEnabled}
                onToggleSelect={() => toggleToolSelect(tool.tool_id)}
                onToggleDefer={() => toggleToolDefer(tool.tool_id)}
                onToggleProgrammatic={() => toggleToolProgrammatic(tool.tool_id)}
              />
            ))}
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-border-light p-3 text-center text-xs text-text-tertiary">
            {localize('com_ui_tools_mcp_no_tools')}
          </p>
        )}
      </div>

      {configDialogProps && <MCPConfigDialog {...configDialogProps} />}
    </div>
  );
}
