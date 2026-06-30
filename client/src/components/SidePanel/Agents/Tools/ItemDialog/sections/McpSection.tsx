import { Clock, Code2 } from 'lucide-react';
import { Constants } from 'librechat-data-provider';
import { useFormContext, useWatch } from 'react-hook-form';
import { Checkbox, Skeleton, TooltipAnchor } from '@librechat/client';
import type { TranslationKeys } from '~/hooks/useLocalize';
import type { McpItem } from '../../items/types';
import type { AgentForm } from '~/common';
import {
  useAgentCapabilities,
  useGetAgentsConfig,
  useMCPServerManager,
  useMCPToolOptions,
} from '~/hooks';
import MCPServerStatusIcon from '~/components/MCP/MCPServerStatusIcon';
import MCPConfigDialog from '~/components/MCP/MCPConfigDialog';
import { useAgentPanelContext } from '~/Providers';
import MCPToolItem from '../../../MCPToolItem';
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
  const { control, getValues, setValue } = useFormContext<AgentForm>();
  const { getServerStatusIconProps, getConfigDialogProps } = useMCPServerManager();
  const { mcpServersMap, mcpToolsLoading } = useAgentPanelContext();
  const { agentsConfig } = useGetAgentsConfig();
  const { deferredToolsEnabled, programmaticToolsEnabled } = useAgentCapabilities(
    agentsConfig?.capabilities,
  );
  const {
    isToolDeferred,
    isToolProgrammatic,
    toggleToolDefer,
    toggleToolProgrammatic,
    areAllToolsDeferred,
    areAllToolsProgrammatic,
    toggleDeferAll,
    toggleProgrammaticAll,
  } = useMCPToolOptions();

  const serverName = item.server.serverName;
  const serverToken = `${Constants.mcp_server}${Constants.mcp_delimiter}${serverName}`;
  /** Live server data — `item.server` is a snapshot from card click and goes stale once
   * the MCP query refetches (e.g., after a server connects), so read from the live map. */
  const liveServer = mcpServersMap.get(serverName) ?? item.server;
  const tools = liveServer.tools ?? [];
  const hasTools = tools.length > 0;

  /** Subscribe to the tools field so selection toggles re-render this section.
   * `getValues` is a non-reactive read and left the checkboxes visually stale. */
  const formTools = (useWatch({ control, name: 'tools' }) ?? []) as string[];

  const getSelectedTools = (): string[] =>
    tools.filter((t) => formTools.includes(t.tool_id)).map((t) => t.tool_id);

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
  const allDeferred = areAllToolsDeferred(tools);
  const allProgrammatic = areAllToolsProgrammatic(tools);
  const statusIconProps = getServerStatusIconProps(serverName);
  const configDialogProps = getConfigDialogProps();
  const connectionState = statusIconProps?.serverStatus?.connectionState;
  const isInitializing = statusIconProps?.isInitializing ?? false;
  const statusDisplay = getStatusDisplay(connectionState, isInitializing, liveServer.isConfigured);
  /** A connected server's tools arrive with the (cold-cache) MCP tools fetch, and
   * the server is also briefly toolless while initializing — show a skeleton in
   * both cases instead of a misleading "no tools" message. */
  const toolsLoading =
    !hasTools && (mcpToolsLoading || isInitializing || connectionState === 'connecting');

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
            <div className="flex items-center gap-0.5">
              {deferredToolsEnabled && (
                <TooltipAnchor
                  description={
                    allDeferred
                      ? localize('com_ui_mcp_undefer_all')
                      : localize('com_ui_mcp_defer_all')
                  }
                  side="top"
                  render={
                    <button
                      type="button"
                      onClick={() => toggleDeferAll(tools)}
                      aria-pressed={allDeferred}
                      aria-label={
                        allDeferred
                          ? localize('com_ui_mcp_undefer_all')
                          : localize('com_ui_mcp_defer_all')
                      }
                      className={cn(
                        'flex size-7 items-center justify-center rounded-md transition-colors',
                        'hover:bg-surface-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary',
                        allDeferred
                          ? 'text-amber-600 dark:text-amber-500'
                          : 'text-text-secondary hover:text-text-primary',
                      )}
                    >
                      <Clock className="size-4" aria-hidden="true" />
                    </button>
                  }
                />
              )}
              {programmaticToolsEnabled && (
                <TooltipAnchor
                  description={
                    allProgrammatic
                      ? localize('com_ui_mcp_unprogrammatic_all')
                      : localize('com_ui_mcp_programmatic_all')
                  }
                  side="top"
                  render={
                    <button
                      type="button"
                      onClick={() => toggleProgrammaticAll(tools)}
                      aria-pressed={allProgrammatic}
                      aria-label={
                        allProgrammatic
                          ? localize('com_ui_mcp_unprogrammatic_all')
                          : localize('com_ui_mcp_programmatic_all')
                      }
                      className={cn(
                        'flex size-7 items-center justify-center rounded-md transition-colors',
                        'hover:bg-surface-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary',
                        allProgrammatic
                          ? 'text-violet-600 dark:text-violet-500'
                          : 'text-text-secondary hover:text-text-primary',
                      )}
                    >
                      <Code2 className="size-4" aria-hidden="true" />
                    </button>
                  }
                />
              )}
              {(deferredToolsEnabled || programmaticToolsEnabled) && (
                <span className="mx-1 h-4 w-px bg-border-light" aria-hidden="true" />
              )}
              <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-xs text-text-secondary">
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
            </div>
          )}
        </div>
        {hasTools && (
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
        )}
        {!hasTools && toolsLoading && (
          <div className="flex flex-col gap-1" aria-busy="true" aria-live="polite">
            {['w-3/5', 'w-1/2', 'w-2/5'].map((width) => (
              <div key={width} className="flex items-center gap-2.5 rounded-lg px-2 py-2">
                <Skeleton className="size-4 shrink-0 rounded" />
                <Skeleton className={cn('h-4 rounded', width)} />
              </div>
            ))}
          </div>
        )}
        {!hasTools && !toolsLoading && (
          <p className="rounded-xl border border-dashed border-border-light p-3 text-center text-xs text-text-tertiary">
            {localize('com_ui_tools_mcp_no_tools')}
          </p>
        )}
      </div>

      {configDialogProps && <MCPConfigDialog {...configDialogProps} />}
    </div>
  );
}
