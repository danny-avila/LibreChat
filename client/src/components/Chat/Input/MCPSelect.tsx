import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Ariakit from '@ariakit/react';
import { useQueryClient } from '@tanstack/react-query';
import { RefreshCw, Wrench, ChevronDown, Search } from 'lucide-react';
import { MultiSelect, MCPIcon, Button, useToastContext } from '@librechat/client';
import { QueryKeys, dataService } from 'librechat-data-provider';
import MCPServerStatusIcon from '~/components/MCP/MCPServerStatusIcon';
import MCPConfigDialog from '~/components/MCP/MCPConfigDialog';
import { useBadgeRowContext } from '~/Providers';
import { useMCPToolsQuery } from '~/data-provider';
import { cn } from '~/utils';

type TogglePillProps = {
  enabled: boolean;
  disabled?: boolean;
  onToggle: (next: boolean) => void;
  label: string;
};

function TogglePill({ enabled, disabled = false, onToggle, label }: TogglePillProps) {
  return (
    <button
      type="button"
      onClick={() => {
        if (disabled) {
          return;
        }
        onToggle(!enabled);
      }}
      aria-pressed={enabled}
      aria-label={label}
      disabled={disabled}
      className={cn(
        'relative inline-flex h-5 w-10 items-center rounded-full border border-border-light transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-border-strong',
        enabled ? 'bg-emerald-400 dark:bg-emerald-500' : 'bg-surface-tertiary',
        disabled && 'cursor-not-allowed opacity-50',
      )}
    >
      <span
        className={cn(
          'ml-1 inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
          enabled ? 'translate-x-4' : 'translate-x-0',
        )}
      />
    </button>
  );
}

function MCPSelectContent() {
  const { conversationId, mcpServerManager } = useBadgeRowContext();
  const {
    localize,
    isPinned,
    mcpValues,
    isInitializing,
    placeholderText,
    configuredServers,
    batchToggleServers,
    getConfigDialogProps,
    getServerStatusIconProps,
    setToolEnabled,
    isToolEnabled,
  } = mcpServerManager;

  const queryClient = useQueryClient();
  const { showToast } = useToastContext();
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);
  const refreshAnimationTimeout = useRef<NodeJS.Timeout | null>(null);

  const { data: mcpToolsData, isFetching: isFetchingTools } = useMCPToolsQuery({
    enabled: (mcpValues?.length ?? 0) > 0,
  });

  const availableServers = useMemo(() => {
    const serversFromQuery = mcpToolsData?.servers ?? {};
    const union = new Set<string>(configuredServers);
    Object.keys(serversFromQuery).forEach((name) => union.add(name));

    return Array.from(union)
      .sort((a, b) => a.localeCompare(b))
      .map((name) => ({
        name,
        server: serversFromQuery[name],
        configured: configuredServers.includes(name),
      }));
  }, [configuredServers, mcpToolsData?.servers]);

  const selectedServers = useMemo(() => new Set(mcpValues ?? []), [mcpValues]);

  const displayedServers = useMemo(() => {
    if (selectedServers.size === 0) {
      return [] as Array<(typeof availableServers)[number]>;
    }

    return availableServers.filter(({ name, server }) => {
      if (selectedServers.has(name)) {
        return true;
      }
      const parent = server?.parentServer;
      return parent != null && selectedServers.has(parent);
    });
  }, [availableServers, selectedServers]);

  type ServerTool = NonNullable<
    NonNullable<(typeof displayedServers)[number]['server']>['tools']
  >[number];

  const toolSections = useMemo(() => {
    return displayedServers
      .map(({ name, server }) => {
        const tools = server?.tools ?? [];
        if (!tools.length) {
          return null;
        }

        return {
          serverName: name,
          parentServer: server?.parentServer,
          tools: tools as ServerTool[],
        };
      })
      .filter((section): section is NonNullable<typeof section> => section !== null);
  }, [displayedServers]);

  const toolCount = useMemo(
    () => toolSections.reduce((count, section) => count + section.tools.length, 0),
    [toolSections],
  );
  const [searchTerm, setSearchTerm] = useState('');
  const normalizedSearch = searchTerm.trim().toLowerCase();

  const filteredSections = useMemo(() => {
    if (!normalizedSearch) {
      return toolSections;
    }

    return toolSections
      .map((section) => {
        const filteredTools = section.tools.filter((tool) => {
          const source = tool.source || section.parentServer || section.serverName;
          const matchesName = tool.name.toLowerCase().includes(normalizedSearch);
          const matchesKey = tool.pluginKey.toLowerCase().includes(normalizedSearch);
          const matchesSource = source?.toLowerCase().includes(normalizedSearch);
          return matchesName || matchesKey || matchesSource;
        });

        return {
          ...section,
          tools: filteredTools,
        };
      })
      .filter((section) => section.tools.length > 0);
  }, [toolSections, normalizedSearch]);

  const visibleToolCount = useMemo(
    () => filteredSections.reduce((count, section) => count + section.tools.length, 0),
    [filteredSections],
  );

  const hasSelection = selectedServers.size > 0;
  const showToolsButton = toolCount > 0;
  const toolsMenuStore = Ariakit.useMenuStore({ placement: 'bottom-end', gutter: 12 });
  const isToolsMenuOpen = toolsMenuStore.useState('open');

  useEffect(() => {
    if (!isToolsMenuOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement;
      const menuElement = toolsMenuStore.getState().contentElement;
      const triggerElement = toolsMenuStore.getState().triggerElement;

      if (!menuElement) {
        return;
      }

      if (menuElement.contains(target)) {
        return;
      }

      if (triggerElement && triggerElement.contains(target)) {
        return;
      }

      toolsMenuStore.hide();
    };

    document.addEventListener('pointerdown', handlePointerDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [toolsMenuStore, isToolsMenuOpen]);

  const refreshTools = useCallback(
    async ({ silent = false, animate = false }: { silent?: boolean; animate?: boolean } = {}) => {
      if (animate) {
        if (refreshAnimationTimeout.current) {
          clearTimeout(refreshAnimationTimeout.current);
          refreshAnimationTimeout.current = null;
        }
        setIsManualRefreshing(true);
      }

      try {
        await queryClient.fetchQuery({
          queryKey: [QueryKeys.mcpTools],
          queryFn: ({ signal }) => dataService.getMCPTools({ refresh: true, signal }),
          staleTime: 0,
        });
      } catch (error) {
        console.error('[MCPSelect] Failed to refresh tools', error);
        if (!silent) {
          showToast({
            status: 'error',
            message: localize('com_ui_refresh_tools_error'),
          });
        }
      } finally {
        if (animate) {
          refreshAnimationTimeout.current = setTimeout(() => {
            setIsManualRefreshing(false);
            refreshAnimationTimeout.current = null;
          }, 250);
        }
      }
    },
    [queryClient, showToast, localize],
  );

  const hasInitializedToolsRef = useRef(false);

  useEffect(() => {
    if (isToolsMenuOpen && !hasInitializedToolsRef.current) {
      hasInitializedToolsRef.current = true;
      void refreshTools({ silent: true });
      return;
    }

    if (!isToolsMenuOpen && hasInitializedToolsRef.current) {
      hasInitializedToolsRef.current = false;
    }
  }, [isToolsMenuOpen, refreshTools]);

  useEffect(() => {
    if (!isToolsMenuOpen && searchTerm) {
      setSearchTerm('');
    }
  }, [isToolsMenuOpen, searchTerm]);

  useEffect(() => {
    return () => {
      if (refreshAnimationTimeout.current) {
        clearTimeout(refreshAnimationTimeout.current);
      }
    };
  }, []);

  const isRefreshing = isFetchingTools || isManualRefreshing;

  const renderSelectedValues = useCallback(
    (values: string[], placeholder?: string) => {
      if (values.length === 0) {
        return placeholder || localize('com_ui_select') + '...';
      }
      if (values.length === 1) {
        return values[0];
      }
      return localize('com_ui_x_selected', { 0: values.length });
    },
    [localize],
  );

  const renderItemContent = useCallback(
    (serverName: string, defaultContent: React.ReactNode) => {
      const statusIconProps = getServerStatusIconProps(serverName);
      const isServerInitializing = isInitializing(serverName);

      const mainContentWrapper = (
        <button
          type="button"
          className={cn(
            'flex flex-grow items-center rounded bg-transparent p-0 text-left transition-colors focus:outline-none',
            isServerInitializing && 'opacity-50',
          )}
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

  if (!isPinned && !hasSelection) {
    return null;
  }

  const configDialogProps = getConfigDialogProps();

  return (
    <div className="flex items-center gap-3">
      <MultiSelect
        items={configuredServers}
        selectedValues={mcpValues ?? []}
        setSelectedValues={batchToggleServers}
        renderSelectedValues={renderSelectedValues}
        renderItemContent={renderItemContent}
        placeholder={placeholderText}
        popoverClassName="min-w-fit"
        className="badge-icon min-w-fit"
        selectIcon={<MCPIcon className="icon-md text-text-primary" />}
        selectItemsClassName="border border-blue-600/50 bg-blue-500/10 hover:bg-blue-700/10"
        selectClassName="group relative inline-flex items-center justify-center gap-2 rounded-full border border-border-medium bg-transparent px-3 py-2 text-sm font-medium transition-all shadow-sm hover:bg-surface-hover hover:shadow-md active:shadow-inner"
      />

      {showToolsButton && hasSelection && (
        <Ariakit.MenuProvider store={toolsMenuStore}>
          <Ariakit.MenuButton
            store={toolsMenuStore}
            className={cn(
              'inline-flex items-center gap-2 rounded-xl border border-border-medium bg-surface-secondary/70 px-4 py-2 text-sm font-semibold text-text-primary shadow-sm transition-all',
              'hover:bg-surface-hover hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-strong',
            )}
          >
            <Wrench className="h-4 w-4 text-text-secondary" />
            <span>{localize('com_ui_tools_button')}</span>
            <span className="rounded-full bg-surface-tertiary px-2 py-0.5 text-xs text-text-secondary">
              {toolCount}
            </span>
            <ChevronDown className="h-4 w-4 text-text-tertiary" />
          </Ariakit.MenuButton>
          <Ariakit.Menu
            store={toolsMenuStore}
            portal={true}
            className={cn(
              'animate-popover z-50 w-[360px] max-w-[90vw] rounded-2xl border border-border-light bg-surface-secondary p-0 text-text-primary shadow-xl',
            )}
          >
            <div className="flex flex-col gap-4 p-4">
              <div className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-semibold text-text-primary">
                    {localize('com_ui_mcp_available_tools')}
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void refreshTools({ animate: true })}
                    className={cn(
                      'gap-1 whitespace-nowrap transition-transform duration-200',
                      isManualRefreshing && 'animate-pulse',
                    )}
                    disabled={isRefreshing}
                    aria-busy={isRefreshing}
                  >
                    <RefreshCw
                      className={cn(
                        'h-3.5 w-3.5 transition-transform',
                        isRefreshing && 'animate-spin',
                      )}
                    />
                    {isRefreshing
                      ? localize('com_ui_refreshing')
                      : localize('com_ui_refresh_tools')}
                  </Button>
                </div>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder={localize('com_ui_mcp_search_tools')}
                    onMouseDown={(event) => {
                      event.stopPropagation();
                    }}
                    onClick={(event) => {
                      event.stopPropagation();
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') {
                        (event.currentTarget as HTMLInputElement).blur();
                        event.stopPropagation();
                      }
                    }}
                    className="w-full rounded-lg border border-border-light bg-surface-primary pl-10 pr-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-strong"
                  />
                </div>
              </div>

              {visibleToolCount === 0 ? (
                <div className="rounded-xl border border-dashed border-border-light bg-surface-primary/60 px-4 py-6 text-center">
                  <p className="text-sm italic text-text-tertiary">
                    {normalizedSearch
                      ? localize('com_ui_no_mcp_tools_search')
                      : localize('com_ui_no_mcp_tools')}
                  </p>
                </div>
              ) : (
                <div className="flex max-h-[380px] flex-col gap-3 overflow-y-auto pr-1">
                  {filteredSections.map((section) => {
                    const controllingServerName = selectedServers.has(section.serverName)
                      ? section.serverName
                      : section.parentServer && selectedServers.has(section.parentServer)
                        ? section.parentServer
                        : null;

                    const isServerInteractive =
                      controllingServerName != null &&
                      selectedServers.has(controllingServerName) &&
                      !isInitializing(controllingServerName);

                    return (
                      <div
                        key={section.serverName}
                        className="space-y-2 rounded-2xl border border-border-light bg-surface-primary/80 p-3 shadow-sm"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-tertiary text-xs font-semibold uppercase text-text-secondary">
                              {section.serverName.slice(0, 2)}
                            </div>
                            <span className="truncate text-sm font-semibold text-text-primary">
                              {section.serverName}
                            </span>
                          </div>
                          <span className="text-xs text-text-tertiary">
                            {localize('com_ui_mcp_tools_summary', { 0: section.tools.length })}
                          </span>
                        </div>

                        <div className="space-y-1.5">
                          {section.tools.map((tool) => {
                            const serverKey = controllingServerName ?? section.serverName;
                            const enabled = isToolEnabled(serverKey, tool.pluginKey);

                            return (
                              <div
                                key={tool.pluginKey}
                                className="flex items-center justify-between rounded-lg border border-border-light bg-surface-primary px-3 py-2"
                              >
                                <span className="truncate text-sm text-text-primary">
                                  {tool.name}
                                </span>
                                <TogglePill
                                  enabled={enabled}
                                  disabled={!isServerInteractive}
                                  onToggle={(next) => setToolEnabled(serverKey, tool.pluginKey, next)}
                                  label={tool.name}
                                />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </Ariakit.Menu>
        </Ariakit.MenuProvider>
      )}

      {configDialogProps && (
        <MCPConfigDialog {...configDialogProps} conversationId={conversationId} />
      )}
    </div>
  );
}

function MCPSelect() {
  const { mcpServerManager } = useBadgeRowContext();
  const { configuredServers } = mcpServerManager;

  if (!configuredServers || configuredServers.length === 0) {
    return null;
  }

  return <MCPSelectContent />;
}

export default memo(MCPSelect);
