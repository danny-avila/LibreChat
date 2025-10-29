import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { ChevronLeft, Trash2, RefreshCw } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Button, useToastContext } from '@librechat/client';
import { Constants, QueryKeys } from 'librechat-data-provider';
import { useUpdateUserPluginsMutation } from 'librechat-data-provider/react-query';
import type { TUpdateUserPlugins } from 'librechat-data-provider';
import ServerInitializationSection from '~/components/MCP/ServerInitializationSection';
import CustomUserVarsSection from '~/components/MCP/CustomUserVarsSection';
import { MCPPanelProvider, useMCPPanelContext } from '~/Providers';
import { useLocalize, useMCPConnectionStatus } from '~/hooks';
import { useGetStartupConfig, useMCPToolsQuery } from '~/data-provider';
import MCPPanelSkeleton from './MCPPanelSkeleton';

type ConfiguredServer = {
  serverName: string;
  config: {
    customUserVars?: Record<string, string>;
    [key: string]: unknown;
  };
};

function MCPPanelContent() {
  const localize = useLocalize();
  const queryClient = useQueryClient();
  const { showToast } = useToastContext();
  const { conversationId } = useMCPPanelContext();

  const { data: startupConfig, isLoading: startupConfigLoading } = useGetStartupConfig();
  const {
    data: mcpToolsData,
    isFetching: isFetchingMcpTools,
    refetch: refetchMcpTools,
  } = useMCPToolsQuery();

  const { connectionStatus } = useMCPConnectionStatus({
    enabled: !!startupConfig?.mcpServers && Object.keys(startupConfig.mcpServers).length > 0,
  });

  const [selectedServerNameForEditing, setSelectedServerNameForEditing] = useState<string | null>(
    null,
  );

  const updateUserPluginsMutation = useUpdateUserPluginsMutation({
    onSuccess: async () => {
      showToast({ message: localize('com_nav_mcp_vars_updated'), status: 'success' });

      await Promise.all([
        queryClient.invalidateQueries([QueryKeys.mcpTools]),
        queryClient.invalidateQueries([QueryKeys.mcpAuthValues]),
        queryClient.invalidateQueries([QueryKeys.mcpConnectionStatus]),
      ]);
    },
    onError: (error: unknown) => {
      console.error('Error updating MCP auth:', error);
      showToast({
        message: localize('com_nav_mcp_vars_update_error'),
        status: 'error',
      });
    },
  });

  const configuredServers = useMemo<ConfiguredServer[]>(() => {
    if (!startupConfig?.mcpServers) {
      return [];
    }
    return Object.entries(startupConfig.mcpServers).map(([serverName, config]) => ({
      serverName,
      config: {
        ...(config as ConfiguredServer['config']),
        customUserVars: (config?.customUserVars as Record<string, string> | undefined) ?? {},
      },
    }));
  }, [startupConfig?.mcpServers]);

  const definitionsMap = useMemo(() => {
    const map = new Map<string, (typeof configuredServers)[number]>();
    configuredServers.forEach((definition) => map.set(definition.serverName, definition));
    return map;
  }, [configuredServers]);

  const configuredNames = useMemo(
    () => configuredServers.map((server) => server.serverName),
    [configuredServers],
  );

  const runtimeNames = useMemo(
    () => Object.keys(mcpToolsData?.servers ?? {}),
    [mcpToolsData?.servers],
  );

  const allServerNames = useMemo(() => {
    const names = new Set<string>();
    configuredNames.forEach((name) => names.add(name));
    runtimeNames.forEach((name) => names.add(name));
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [configuredNames, runtimeNames]);

  const summaryServerNames = useMemo(() => {
    const primary = runtimeNames.filter((name) => {
      const runtime = mcpToolsData?.servers?.[name];
      return !runtime?.parentServer || runtime.parentServer === name;
    });

    if (primary.length > 0) {
      return primary;
    }

    return allServerNames;
  }, [runtimeNames, mcpToolsData?.servers, allServerNames]);

  useEffect(() => {
    if (summaryServerNames.length === 0) {
      return;
    }

    const interval = setInterval(() => {
      void refetchMcpTools({ cancelRefetch: false });
    }, 45000);

    return () => {
      clearInterval(interval);
    };
  }, [summaryServerNames.length, refetchMcpTools]);

  const { connectedCount, totalTools } = useMemo(() => {
    let connected = 0;
    let toolsTotal = 0;

    summaryServerNames.forEach((name) => {
      const runtime = mcpToolsData?.servers?.[name];
      const statusEntry =
        connectionStatus?.[name] ??
        (runtime?.parentServer ? connectionStatus?.[runtime.parentServer] : undefined);

      if (statusEntry?.connectionState === 'connected') {
        connected += 1;
      }

      toolsTotal += runtime?.tools?.length ?? 0;
    });

    return { connectedCount: connected, totalTools };
  }, [summaryServerNames, mcpToolsData?.servers, connectionStatus]);

  const handleServerClickToEdit = (serverName: string) => {
    if (definitionsMap.has(serverName)) {
      setSelectedServerNameForEditing(serverName);
    }
  };

  const handleGoBackToList = () => {
    setSelectedServerNameForEditing(null);
  };

  const handleConfigSave = useCallback(
    (targetName: string, authData: Record<string, string>) => {
      const payload: TUpdateUserPlugins = {
        pluginKey: `${Constants.mcp_prefix}${targetName}`,
        action: 'install',
        auth: authData,
      };
      updateUserPluginsMutation.mutate(payload);
    },
    [updateUserPluginsMutation],
  );

  const handleConfigRevoke = useCallback(
    (targetName: string) => {
      const payload: TUpdateUserPlugins = {
        pluginKey: `${Constants.mcp_prefix}${targetName}`,
        action: 'uninstall',
        auth: {},
      };
      updateUserPluginsMutation.mutate(payload);
    },
    [updateUserPluginsMutation],
  );

  if (startupConfigLoading && !mcpToolsData) {
    return <MCPPanelSkeleton />;
  }

  if (!startupConfigLoading && allServerNames.length === 0) {
    return (
      <div className="p-4 text-center text-sm text-text-secondary">
        {localize('com_sidepanel_mcp_no_servers_with_vars')}
      </div>
    );
  }

  if (selectedServerNameForEditing) {
    const serverDefinition = definitionsMap.get(selectedServerNameForEditing);

    if (!serverDefinition) {
      setSelectedServerNameForEditing(null);
      return null;
    }

    const serverStatus = connectionStatus?.[selectedServerNameForEditing];
    const isConnected = serverStatus?.connectionState === 'connected';

    return (
      <div className="h-auto max-w-full space-y-4 overflow-x-hidden py-2">
        <Button
          variant="outline"
          onClick={handleGoBackToList}
          size="sm"
          aria-label={localize('com_ui_back')}
        >
          <ChevronLeft className="mr-1 h-4 w-4" />
          {localize('com_ui_back')}
        </Button>

        <div className="mb-4">
          <CustomUserVarsSection
            serverName={selectedServerNameForEditing}
            fields={serverDefinition.config.customUserVars}
            onSave={(authData) => handleConfigSave(selectedServerNameForEditing, authData)}
            onRevoke={() => handleConfigRevoke(selectedServerNameForEditing)}
            isSubmitting={updateUserPluginsMutation.isLoading}
          />
        </div>

        <ServerInitializationSection
          sidePanel={true}
          conversationId={conversationId}
          serverName={selectedServerNameForEditing}
          requiresOAuth={serverStatus?.requiresOAuth || false}
          hasCustomUserVars={
            Object.keys(serverDefinition.config.customUserVars || {}).length > 0
          }
        />

        {serverStatus?.requiresOAuth && isConnected && (
          <Button
            className="w-full"
            size="sm"
            variant="destructive"
            onClick={() => handleConfigRevoke(selectedServerNameForEditing)}
            aria-label={localize('com_ui_oauth_revoke')}
          >
            <Trash2 className="h-4 w-4" />
            {localize('com_ui_oauth_revoke')}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="h-auto max-w-full overflow-x-hidden py-2">
      {allServerNames.length > 0 && (
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-surface-tertiary px-3 py-1 text-xs font-medium text-text-secondary">
              {localize('com_ui_mcp_running_summary', {
                0: connectedCount,
                1: summaryServerNames.length,
              })}
            </span>
            <span className="rounded-full bg-surface-tertiary px-3 py-1 text-xs font-medium text-text-secondary">
              {localize('com_ui_mcp_tools_summary', { 0: totalTools })}
            </span>
          </div>
          {allServerNames.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void refetchMcpTools();
              }}
              disabled={isFetchingMcpTools}
              aria-label={localize('com_ui_refresh_tools')}
            >
              <RefreshCw className={`h-4 w-4 ${isFetchingMcpTools ? 'animate-spin' : ''}`} />
              <span className="ml-2">{localize('com_ui_refresh_tools')}</span>
            </Button>
          )}
        </div>
      )}

      <div className="space-y-3">
        {allServerNames.map((serverName) => {
          const definition = definitionsMap.get(serverName);
          const runtime = mcpToolsData?.servers?.[serverName];
          const parentServer = runtime?.parentServer;
          const connectionEntry =
            connectionStatus?.[serverName] ??
            (parentServer ? connectionStatus?.[parentServer] : undefined);
          const connectionState = connectionEntry?.connectionState ?? 'disconnected';
          const requiresOAuth = connectionEntry?.requiresOAuth || false;
          const tools = runtime?.tools ?? [];

          const statusClass = (() => {
            switch (connectionState) {
              case 'connected':
                return 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300';
              case 'connecting':
                return 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300';
              case 'error':
                return 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300';
              default:
                return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
            }
          })();

          const hasCustomUserVars = definition
            ? Object.keys(definition.config.customUserVars || {}).length > 0
            : false;

          return (
            <div
              key={serverName}
              className="space-y-3 rounded-xl border border-border-light bg-surface-secondary p-3"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold text-text-primary">{serverName}</h3>
                  {parentServer && parentServer !== serverName && (
                    <p className="text-xs text-text-tertiary">
                      {localize('com_ui_mcp_via_server', { 0: parentServer })}
                    </p>
                  )}
                  <p className="text-xs text-text-secondary">
                    {localize('com_ui_tool_collection_prefix')} {serverName}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs capitalize ${statusClass}`}>
                    {connectionState}
                  </span>
                  <span className="rounded-full bg-surface-tertiary px-2 py-0.5 text-xs text-text-secondary">
                    {localize('com_ui_mcp_tools_summary', { 0: tools.length })}
                  </span>
                  {definition && (
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => handleServerClickToEdit(serverName)}
                      aria-label={`${localize('com_ui_edit')} ${serverName}`}
                    >
                      {localize('com_ui_edit')}
                    </Button>
                  )}
                </div>
              </div>

              {definition && (
                <ServerInitializationSection
                  sidePanel={true}
                  conversationId={conversationId}
                  serverName={serverName}
                  requiresOAuth={requiresOAuth}
                  hasCustomUserVars={hasCustomUserVars}
                />
              )}

              <div className="rounded-lg border border-border-light bg-surface-primary/60 p-2">
                <div className="mb-2 text-xs font-semibold uppercase text-text-secondary">
                  {localize('com_ui_available_tools')}
                </div>
                {tools.length > 0 ? (
                  <div className="space-y-1">
                    {tools.map((tool) => (
                      <div
                        key={tool.pluginKey}
                        className="flex items-center justify-between rounded-md bg-surface-tertiary px-2 py-1 text-xs text-text-primary"
                      >
                        <span className="truncate font-medium">{tool.name}</span>
                        <span className="ml-2 truncate text-text-secondary">
                          {tool.source || parentServer || serverName}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs italic text-text-tertiary">
                    {localize('com_ui_no_mcp_tools')}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function MCPPanel() {
  return (
    <MCPPanelProvider>
      <MCPPanelContent />
    </MCPPanelProvider>
  );
}
