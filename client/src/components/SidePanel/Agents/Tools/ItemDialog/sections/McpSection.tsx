import { useState, useMemo, useEffect, useCallback } from 'react';
import { Clock, Code2, Zap } from 'lucide-react';
import { useFormContext, useWatch } from 'react-hook-form';
import { Button, Spinner, Checkbox, Skeleton } from '@librechat/client';
import type { MouseEvent } from 'react';
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
import { mcpAllToken, mcpServerToken } from '../../items/selectors';
import MCPConfigDialog from '~/components/MCP/MCPConfigDialog';
import McpOAuthDialog from '~/components/MCP/McpOAuthDialog';
import { useAgentPanelContext } from '~/Providers';
import { getIconForItem } from '../../items/icons';
import OptionToggle from '../../../OptionToggle';
import MCPToolItem from '../../../MCPToolItem';
import { Collapse } from '~/components/ui';
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
  const {
    getServerStatusIconProps,
    getConfigDialogProps,
    initializeServer,
    isConnectionDeferred,
    resetConnectionDeferred,
    getOAuthUrl,
  } = useMCPServerManager();
  const [oauthOpen, setOauthOpen] = useState(false);
  const [oauthUrl, setOauthUrl] = useState<string | null>(null);
  const [prevConnected, setPrevConnected] = useState(false);
  const [autoSelectPending, setAutoSelectPending] = useState(false);
  const { mcpServersMap, mcpToolsLoading } = useAgentPanelContext();
  const { agentsConfig } = useGetAgentsConfig();
  const { deferredToolsEnabled, programmaticToolsEnabled, backgroundToolsEnabled } =
    useAgentCapabilities(agentsConfig?.capabilities);
  const {
    isToolDeferred,
    isToolProgrammatic,
    isToolBackground,
    toggleToolDefer,
    toggleToolProgrammatic,
    toggleToolBackground,
    areAllToolsDeferred,
    areAllToolsProgrammatic,
    areAllToolsBackground,
    toggleDeferAll,
    toggleProgrammaticAll,
    toggleBackgroundAll,
  } = useMCPToolOptions();

  const serverName = item.server.serverName;
  const serverToken = mcpServerToken(serverName);
  const serverAllToken = mcpAllToken(serverName);
  /** Live server data — `item.server` is a snapshot from card click and goes stale once
   * the MCP query refetches (e.g., after a server connects), so read from the live map. */
  const liveServer = mcpServersMap.get(serverName) ?? item.server;
  const tools = useMemo(() => liveServer.tools ?? [], [liveServer.tools]);
  const hasTools = tools.length > 0;

  /** Subscribe to the tools field so selection toggles re-render this section.
   * `getValues` is a non-reactive read and left the checkboxes visually stale. */
  const formTools = (useWatch({ control, name: 'tools' }) ?? []) as string[];
  /** Attached via the server-wide `mcp_all` wildcard — used by request-scoped
   * servers whose tools resolve at chat-turn time and can't be listed here. */
  const isWildcardAttached = formTools.includes(serverAllToken);

  /** The `mcp_all` wildcard grants every server tool at runtime, so when the
   * server's tools ARE enumerable (e.g. it stopped being request-scoped), fold
   * the wildcard into the display as "all selected" — otherwise the dialog
   * would show unchecked boxes while runtime grants everything. Any selection
   * interaction then rewrites the form with concrete tool ids (the wildcard is
   * stripped by `updateFormTools`), converting the attachment on first touch. */
  const getSelectedTools = (): string[] =>
    isWildcardAttached
      ? tools.map((t) => t.tool_id)
      : tools.filter((t) => formTools.includes(t.tool_id)).map((t) => t.tool_id);

  /** Replace this server's tool selection while keeping the server attached: the
   * placeholder token is always rewritten, so deselect-all leaves the server
   * pinned with zero tools; only an explicit remove detaches it. The `mcp_all`
   * wildcard is also stripped unless explicitly re-passed in `next`, so a
   * per-tool selection always supersedes a stale wildcard (e.g. after a server
   * stops being request-scoped and its tools become enumerable). */
  const updateFormTools = useCallback(
    (next: string[]) => {
      const current = (getValues('tools') ?? []) as string[];
      const otherTools = current.filter(
        (t) => t !== serverToken && t !== serverAllToken && !tools.some((st) => st.tool_id === t),
      );
      setValue('tools', [...otherTools, serverToken, ...next], { shouldDirty: true });
    },
    [getValues, setValue, serverToken, serverAllToken, tools],
  );

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
  const allBackground = areAllToolsBackground(tools);
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
  const isConnected = connectionState === 'connected';
  const isBusy = isInitializing || connectionState === 'connecting';

  /** Close + clear the OAuth dialog once the server connects, and don't let it
   * reopen on its own if the connection later drops. No useEffect — adjust state
   * during render by comparing against the previous connection result. */
  if (prevConnected !== isConnected) {
    setPrevConnected(isConnected);
    if (isConnected) {
      setOauthOpen(false);
      setOauthUrl(null);
    }
  }

  /** Connecting from this dialog implies the user wants the server's tools:
   * once the connection settles and the tools arrive (query refetch for direct
   * connects, polling for OAuth), select them all — an effect because both
   * signals come from external systems, not from anything rendered here.
   *
   * Request-scoped servers (runtime `{{LIBRECHAT_BODY_*}}` placeholders) defer
   * their connection to the next chat turn, so no tool list will ever arrive —
   * attach the whole server via the `mcp_all` wildcard instead; the backend
   * resolves it into the server's full tool set at turn time. Keying on the
   * manager's init state (not the awaited response) also covers connects that
   * happen behind the customUserVars config dialog, which this component does
   * not await. */
  const serverDeferred = isConnectionDeferred(serverName);
  useEffect(() => {
    if (!autoSelectPending) {
      return;
    }
    if (serverDeferred && !hasTools) {
      setAutoSelectPending(false);
      if (!isWildcardAttached) {
        updateFormTools([serverAllToken]);
      }
      return;
    }
    if (!isConnected || !hasTools) {
      return;
    }
    setAutoSelectPending(false);
    updateFormTools(tools.map((t) => t.tool_id));
  }, [
    autoSelectPending,
    serverDeferred,
    isConnected,
    hasTools,
    tools,
    updateFormTools,
    isWildcardAttached,
    serverAllToken,
  ]);

  /** Connect inline from this first dialog. Servers with custom user variables are
   * routed to the config dialog (which sets the vars and initializes); others
   * connect directly. `autoOpenOAuth=false` surfaces the URL in our OAuth dialog
   * (continue / copy / QR) instead of the browser silently opening a tab. */
  const handleConnect = async (e: MouseEvent) => {
    setAutoSelectPending(true);
    if (statusIconProps != null && statusIconProps.hasCustomUserVars) {
      /** A stale deferred flag from an earlier attempt must not fire the
       * auto-attach effect while the config dialog is open — only this
       * attempt's outcome (recorded on save → initialize) counts. The direct
       * path below needs no reset: initializeServer clears it up front. */
      resetConnectionDeferred(serverName);
      statusIconProps.onConfigClick(e);
      return;
    }
    try {
      const res = await initializeServer(serverName, false);
      if (res == null || !res.success) {
        setAutoSelectPending(false);
        return;
      }
      if (res.oauthRequired && res.oauthUrl) {
        setOauthUrl(res.oauthUrl);
        setOauthOpen(true);
      }
    } catch {
      setAutoSelectPending(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      {item.description && (
        <p className="max-h-40 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-text-secondary">
          {item.description}
        </p>
      )}

      <div className="flex flex-col">
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
          {isConnected && statusIconProps && <MCPServerStatusIcon {...statusIconProps} />}
        </div>

        {/* Connect collapses smoothly once connected. Its top spacing lives inside
         * the reveal so the parent's flex gap never leaves a hole when it's gone,
         * and the auto-height dialog follows the grid-rows tween in one motion. */}
        <div
          className={cn(
            'grid transition-[grid-template-rows] [transition-duration:var(--resize-dur)] [transition-timing-function:var(--resize-ease)] motion-reduce:transition-none',
            isConnected ? 'grid-rows-[0fr]' : 'grid-rows-[1fr]',
          )}
        >
          <div className="min-h-0 overflow-hidden">
            <Button
              type="button"
              variant="submit"
              className="mt-5 w-full gap-2"
              disabled={isBusy}
              tabIndex={isConnected ? -1 : undefined}
              aria-hidden={isConnected || undefined}
              onClick={handleConnect}
            >
              {isBusy && <Spinner className="size-4" />}
              {localize('com_nav_mcp_connect_server', { 0: serverName })}
            </Button>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex min-h-7 items-center justify-between">
          <span className="text-[11px] font-medium uppercase tracking-wide text-text-secondary">
            {localize('com_ui_tools_mcp_tools_section')}
          </span>
          {hasTools && (
            <div className="flex items-center gap-0.5">
              {deferredToolsEnabled && (
                <OptionToggle
                  icon={Clock}
                  size="md"
                  pressed={allDeferred}
                  label={localize(allDeferred ? 'com_ui_mcp_undefer_all' : 'com_ui_mcp_defer_all')}
                  activeClass="text-amber-600 dark:text-amber-500"
                  onToggle={() => toggleDeferAll(tools)}
                />
              )}
              {programmaticToolsEnabled && (
                <OptionToggle
                  icon={Code2}
                  size="md"
                  pressed={allProgrammatic}
                  label={localize(
                    allProgrammatic
                      ? 'com_ui_mcp_unprogrammatic_all'
                      : 'com_ui_mcp_programmatic_all',
                  )}
                  activeClass="text-violet-600 dark:text-violet-500"
                  onToggle={() => toggleProgrammaticAll(tools)}
                />
              )}
              {backgroundToolsEnabled && (
                <OptionToggle
                  icon={Zap}
                  size="md"
                  pressed={allBackground}
                  label={localize(
                    allBackground ? 'com_ui_mcp_unbackground_all' : 'com_ui_mcp_background_all',
                  )}
                  activeClass="text-sky-600 dark:text-sky-500"
                  onToggle={() => toggleBackgroundAll(tools)}
                />
              )}
              {(deferredToolsEnabled || programmaticToolsEnabled || backgroundToolsEnabled) && (
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
        {/* Loading skeleton, tool list, and empty state share one slot and
         * cross-swap via stacked collapses so their differing heights morph
         * smoothly; the dialog's auto-height follows in a single motion. */}
        <div>
          <Collapse open={hasTools}>
            <div className="flex flex-col gap-1">
              {tools.map((tool) => (
                <MCPToolItem
                  key={tool.tool_id}
                  tool={tool}
                  isSelected={selectedTools.includes(tool.tool_id)}
                  isDeferred={deferredToolsEnabled && isToolDeferred(tool.tool_id)}
                  isProgrammatic={programmaticToolsEnabled && isToolProgrammatic(tool.tool_id)}
                  isBackground={backgroundToolsEnabled && isToolBackground(tool.tool_id)}
                  deferredToolsEnabled={deferredToolsEnabled}
                  programmaticToolsEnabled={programmaticToolsEnabled}
                  backgroundToolsEnabled={backgroundToolsEnabled}
                  onToggleSelect={() => toggleToolSelect(tool.tool_id)}
                  onToggleDefer={() => toggleToolDefer(tool.tool_id)}
                  onToggleProgrammatic={() => toggleToolProgrammatic(tool.tool_id)}
                  onToggleBackground={() => toggleToolBackground(tool.tool_id)}
                />
              ))}
            </div>
          </Collapse>
          <Collapse open={!hasTools && toolsLoading}>
            <div className="flex flex-col gap-1" aria-busy="true" aria-live="polite">
              {['w-3/5', 'w-1/2', 'w-2/5'].map((width) => (
                <div key={width} className="flex items-center gap-2.5 rounded-lg px-2 py-2">
                  <Skeleton className="size-4 shrink-0 rounded" />
                  <Skeleton className={cn('h-4 rounded', width)} />
                </div>
              ))}
            </div>
          </Collapse>
          <Collapse open={!hasTools && !toolsLoading}>
            <p className="rounded-xl border border-dashed border-border-light p-3 text-center text-xs text-text-tertiary">
              {localize(
                isWildcardAttached ? 'com_ui_tools_mcp_runtime_tools' : 'com_ui_tools_mcp_no_tools',
              )}
            </p>
          </Collapse>
        </div>
      </div>

      {configDialogProps && <MCPConfigDialog {...configDialogProps} />}
      <McpOAuthDialog
        open={oauthOpen && !isConnected}
        onOpenChange={setOauthOpen}
        serverName={serverName}
        oauthUrl={oauthUrl ?? getOAuthUrl(serverName) ?? ''}
        iconUrl={getIconForItem(item).iconUrl}
      />
    </div>
  );
}
