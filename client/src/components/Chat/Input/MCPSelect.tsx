import { Constants } from 'librechat-data-provider';
import React, { memo, useCallback, useState, useMemo } from 'react';
import { useUpdateUserPluginsMutation } from 'librechat-data-provider/react-query';
import { SettingsIcon, AlertTriangle, Loader2, KeyRound, PlugZap } from 'lucide-react';
import type { TUpdateUserPlugins, TPlugin } from 'librechat-data-provider';
import MCPConfigDialog, { type ConfigFieldDetail } from '~/components/ui/MCP/MCPConfigDialog';
import { useMCPConnectionStatusQuery } from '~/data-provider/Tools/queries';
import { useToastContext, useBadgeRowContext } from '~/Providers';
import MultiSelect from '~/components/ui/MultiSelect';
import { MCPIcon } from '~/components/svg';
import { useLocalize } from '~/hooks';

const getBaseMCPPluginKey = (fullPluginKey: string): string => {
  const parts = fullPluginKey.split(Constants.mcp_delimiter);
  return Constants.mcp_prefix + parts[parts.length - 1];
};

function MCPSelect() {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const { mcpSelect, startupConfig } = useBadgeRowContext();
  const { mcpValues, setMCPValues, mcpToolDetails, isPinned } = mcpSelect;

  // Get all configured MCP servers from config
  const configuredServers = useMemo(() => {
    return Object.keys(startupConfig?.mcpServers || {});
  }, [startupConfig?.mcpServers]);

  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [selectedToolForConfig, setSelectedToolForConfig] = useState<TPlugin | null>(null);

  const updateUserPluginsMutation = useUpdateUserPluginsMutation({
    onSuccess: () => {
      setIsConfigModalOpen(false);
      showToast({ message: localize('com_nav_mcp_vars_updated'), status: 'success' });
    },
    onError: (error: unknown) => {
      console.error('Error updating MCP auth:', error);
      showToast({
        message: localize('com_nav_mcp_vars_update_error'),
        status: 'error',
      });
    },
  });

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

  const handleConfigSave = useCallback(
    (targetName: string, authData: Record<string, string>) => {
      if (selectedToolForConfig && selectedToolForConfig.name === targetName) {
        const basePluginKey = getBaseMCPPluginKey(selectedToolForConfig.pluginKey);

        const payload: TUpdateUserPlugins = {
          pluginKey: basePluginKey,
          action: 'install',
          auth: authData,
        };
        updateUserPluginsMutation.mutate(payload);
      }
    },
    [selectedToolForConfig, updateUserPluginsMutation],
  );

  const handleConfigRevoke = useCallback(
    (targetName: string) => {
      if (selectedToolForConfig && selectedToolForConfig.name === targetName) {
        const basePluginKey = getBaseMCPPluginKey(selectedToolForConfig.pluginKey);

        const payload: TUpdateUserPlugins = {
          pluginKey: basePluginKey,
          action: 'uninstall',
          auth: {},
        };
        updateUserPluginsMutation.mutate(payload);
      }
    },
    [selectedToolForConfig, updateUserPluginsMutation],
  );

  // Get connection status for all MCP servers
  const { data: connectionStatusData } = useMCPConnectionStatusQuery();
  const connectionStatus = useMemo(
    () => connectionStatusData?.connectionStatus || {},
    [connectionStatusData?.connectionStatus],
  );

  const renderItemContent = useCallback(
    (serverName: string, defaultContent: React.ReactNode) => {
      const tool = mcpToolDetails?.find((t) => t.name === serverName);
      const serverStatus = connectionStatus[serverName];
      const serverConfig = startupConfig?.mcpServers?.[serverName];

      // Check for auth config from either tool details or server config
      const hasAuthConfig =
        (tool?.authConfig && tool.authConfig.length > 0) ||
        (serverConfig?.customUserVars && Object.keys(serverConfig.customUserVars).length > 0);

      // Handle click for opening config dialog
      const handleConfigClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        // Create tool object if it doesn't exist
        const configTool = tool || {
          name: serverName,
          pluginKey: `${Constants.mcp_prefix}${serverName}`,
          authConfig: serverConfig?.customUserVars
            ? Object.entries(serverConfig.customUserVars).map(([key, config]) => ({
                authField: key,
                label: config.title,
                description: config.description,
              }))
            : [],
          authenticated: false,
        };
        setSelectedToolForConfig(configTool);
        setIsConfigModalOpen(true);
      };

      // Determine which icon to show based on connection state and auth config
      const getStatusIcon = () => {
        if (!serverStatus) {
          return null; // No status info available
        }

        const { connectionState, requiresOAuth } = serverStatus;

        // For connecting state, just show loading - not clickable
        if (connectionState === 'connecting') {
          return (
            <Loader2
              className="h-4 w-4 animate-spin text-blue-500"
              aria-label={localize('com_nav_mcp_status_connecting', { 0: serverName })}
            />
          );
        }

        // All other states should be clickable buttons
        let IconComponent, className, label;

        if (connectionState === 'disconnected') {
          if (requiresOAuth) {
            IconComponent = KeyRound;
            className = 'h-4 w-4 text-amber-500';
            label = localize('com_nav_mcp_status_disconnected_oauth', { 0: serverName });
          } else {
            IconComponent = PlugZap;
            className = 'h-4 w-4 text-orange-500';
            label = localize('com_nav_mcp_status_disconnected', { 0: serverName });
          }
        } else if (connectionState === 'error') {
          IconComponent = AlertTriangle;
          className = 'h-4 w-4 text-red-500';
          label = localize('com_nav_mcp_status_error', { 0: serverName });
        } else if (connectionState === 'connected') {
          if (hasAuthConfig) {
            IconComponent = SettingsIcon;
            className = `h-4 w-4 ${tool?.authenticated ? 'text-green-500' : 'text-gray-400'}`;
            label = tool?.authenticated
              ? localize('com_nav_mcp_status_authenticated', { 0: serverName })
              : localize('com_nav_mcp_status_not_authenticated', { 0: serverName });
          } else {
            // Connected but no auth config - no icon
            return null;
          }
        }

        // Return clickable button for all states except connecting
        if (IconComponent) {
          return (
            <button
              type="button"
              onClick={handleConfigClick}
              className="flex h-6 w-6 items-center justify-center rounded p-1 hover:bg-surface-secondary"
              aria-label={localize('com_nav_mcp_configure_server', { 0: serverName })}
            >
              <IconComponent className={className} />
            </button>
          );
        }

        return null;
      };

      // Common wrapper for the main content (check mark + text)
      // Ensures Check & Text are adjacent and the group takes available space.
      const mainContentWrapper = (
        <div className="flex flex-grow items-center">{defaultContent}</div>
      );

      const statusIcon = getStatusIcon();

      // Show status icon if available, or settings button for connected servers with auth config
      if (statusIcon || (hasAuthConfig && serverStatus?.connectionState === 'connected')) {
        return (
          <div className="flex w-full items-center justify-between">
            {mainContentWrapper}
            <div className="ml-2 flex items-center">
              {/* Show status icon (which includes clickable config buttons) */}
              {statusIcon ||
                (hasAuthConfig && serverStatus?.connectionState === 'connected' && (
                  <button
                    type="button"
                    onClick={handleConfigClick}
                    className="flex h-6 w-6 items-center justify-center rounded p-1 hover:bg-surface-secondary"
                    aria-label={`Configure ${serverName}`}
                  >
                    <SettingsIcon
                      className={`h-4 w-4 ${tool?.authenticated ? 'text-green-500' : 'text-gray-400'}`}
                    />
                  </button>
                ))}
            </div>
          </div>
        );
      }
      // For items without a settings icon, return the consistently wrapped main content.
      return mainContentWrapper;
    },
    [mcpToolDetails, connectionStatus, startupConfig?.mcpServers, localize],
  );

  // Don't render if no servers are selected and not pinned
  if ((!mcpValues || mcpValues.length === 0) && !isPinned) {
    return null;
  }

  // Don't render if no MCP servers are configured
  if (!configuredServers || configuredServers.length === 0) {
    return null;
  }

  const placeholderText =
    startupConfig?.interface?.mcpServers?.placeholder || localize('com_ui_mcp_servers');
  return (
    <>
      <MultiSelect
        items={configuredServers}
        selectedValues={mcpValues ?? []}
        setSelectedValues={setMCPValues}
        defaultSelectedValues={mcpValues ?? []}
        renderSelectedValues={renderSelectedValues}
        renderItemContent={renderItemContent}
        placeholder={placeholderText}
        popoverClassName="min-w-fit"
        className="badge-icon min-w-fit"
        selectIcon={<MCPIcon className="icon-md text-text-primary" />}
        selectItemsClassName="border border-blue-600/50 bg-blue-500/10 hover:bg-blue-700/10"
        selectClassName="group relative inline-flex items-center justify-center md:justify-start gap-1.5 rounded-full border border-border-medium text-sm font-medium transition-all md:w-full size-9 p-2 md:p-3 bg-transparent shadow-sm hover:bg-surface-hover hover:shadow-md active:shadow-inner"
      />
      {selectedToolForConfig && (
        <MCPConfigDialog
          isOpen={isConfigModalOpen}
          onOpenChange={setIsConfigModalOpen}
          serverName={selectedToolForConfig.name}
          fieldsSchema={(() => {
            const schema: Record<string, ConfigFieldDetail> = {};
            if (selectedToolForConfig?.authConfig) {
              selectedToolForConfig.authConfig.forEach((field) => {
                schema[field.authField] = {
                  title: field.label,
                  description: field.description,
                };
              });
            }
            return schema;
          })()}
          initialValues={(() => {
            const initial: Record<string, string> = {};
            // Note: Actual initial values might need to be fetched if they are stored user-specifically
            if (selectedToolForConfig?.authConfig) {
              selectedToolForConfig.authConfig.forEach((field) => {
                initial[field.authField] = ''; // Or fetched value
              });
            }
            return initial;
          })()}
          onSave={(authData) => {
            if (selectedToolForConfig) {
              handleConfigSave(selectedToolForConfig.name, authData);
            }
          }}
          onRevoke={() => {
            if (selectedToolForConfig) {
              handleConfigRevoke(selectedToolForConfig.name);
            }
          }}
          isSubmitting={updateUserPluginsMutation.isLoading}
        />
      )}
    </>
  );
}

export default memo(MCPSelect);
