import React, { memo, useCallback, useState, useMemo } from 'react';
import { SettingsIcon, PlugZap } from 'lucide-react';
import { Constants } from 'librechat-data-provider';
import { useUpdateUserPluginsMutation } from 'librechat-data-provider/react-query';
import { useMCPConnectionStatusQuery } from '~/data-provider';
import { useQueryClient } from '@tanstack/react-query';
import { QueryKeys } from 'librechat-data-provider';
import type { TUpdateUserPlugins, TPlugin } from 'librechat-data-provider';
import { MCPConfigDialog, type ConfigFieldDetail } from '~/components/ui/MCP';
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
  const { mcpValues, setMCPValues, isPinned } = mcpSelect;

  // Get real connection status from MCPManager
  const { data: statusQuery } = useMCPConnectionStatusQuery();
  const mcpServerStatuses = useMemo(
    () => statusQuery?.connectionStatus || {},
    [statusQuery?.connectionStatus],
  );

  console.log('mcpServerStatuses', mcpServerStatuses);
  console.log('statusQuery', statusQuery);

  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [selectedToolForConfig, setSelectedToolForConfig] = useState<TPlugin | null>(null);

  const queryClient = useQueryClient();

  const updateUserPluginsMutation = useUpdateUserPluginsMutation({
    onSuccess: async () => {
      showToast({ message: localize('com_nav_mcp_vars_updated'), status: 'success' });

      // // For 'uninstall' actions (revoke), remove the server from selected values
      // if (variables.action === 'uninstall') {
      //   const serverName = variables.pluginKey.replace(Constants.mcp_prefix, '');
      //   const currentValues = mcpValues ?? [];
      //   const filteredValues = currentValues.filter((name) => name !== serverName);
      //   setMCPValues(filteredValues);
      // }

      // Wait for all refetches to complete before ending loading state
      await Promise.all([
        queryClient.invalidateQueries([QueryKeys.tools]),
        queryClient.refetchQueries([QueryKeys.tools]),
        queryClient.invalidateQueries([QueryKeys.mcpAuthValues]),
        queryClient.refetchQueries([QueryKeys.mcpAuthValues]),
        queryClient.invalidateQueries([QueryKeys.mcpConnectionStatus]),
        queryClient.refetchQueries([QueryKeys.mcpConnectionStatus]),
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
        // Use the pluginKey directly since it's already in the correct format
        console.log(
          `[MCP Select] Saving config for ${targetName}, pluginKey: ${`${Constants.mcp_prefix}${targetName}`}`,
        );
        const payload: TUpdateUserPlugins = {
          pluginKey: `${Constants.mcp_prefix}${targetName}`,
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
        // Use the pluginKey directly since it's already in the correct format
        console.log(
          `[MCP Select] Revoking config for ${targetName}, pluginKey: ${`${Constants.mcp_prefix}${targetName}`}`,
        );
        const payload: TUpdateUserPlugins = {
          pluginKey: `${Constants.mcp_prefix}${targetName}`,
          action: 'uninstall',
          auth: {},
        };
        updateUserPluginsMutation.mutate(payload);
      }
    },
    [selectedToolForConfig, updateUserPluginsMutation],
  );

  // Create stable callback references to prevent stale closures
  const handleSave = useCallback(
    (authData: Record<string, string>) => {
      if (selectedToolForConfig) {
        handleConfigSave(selectedToolForConfig.name, authData);
      }
    },
    [selectedToolForConfig, handleConfigSave],
  );

  const handleRevoke = useCallback(() => {
    if (selectedToolForConfig) {
      handleConfigRevoke(selectedToolForConfig.name);
    }
  }, [selectedToolForConfig, handleConfigRevoke]);

  // Only allow connected servers to be selected
  const handleSetSelectedValues = useCallback(
    (values: string[]) => {
      // Filter to only include connected servers
      const connectedValues = values.filter((serverName) => {
        const serverStatus = mcpServerStatuses?.[serverName];
        return serverStatus?.connected || false;
      });
      setMCPValues(connectedValues);
    },
    [setMCPValues, mcpServerStatuses],
  );

  const renderItemContent = useCallback(
    (serverName: string, defaultContent: React.ReactNode) => {
      const serverStatus = mcpServerStatuses?.[serverName];
      const connected = serverStatus?.connected || false;
      const hasAuthConfig = serverStatus?.hasAuthConfig || false;

      // Icon logic:
      // - connected with auth config = gear (green)
      // - connected without auth config = no icon (just text)
      // - not connected = zap (orange)
      let icon: React.ReactNode = null;
      let tooltip = 'Configure server';

      if (connected) {
        if (hasAuthConfig) {
          icon = <SettingsIcon className="h-4 w-4 text-green-500" />;
          tooltip = 'Configure connected server';
        } else {
          // No icon for connected servers without auth config
          tooltip = 'Connected server (no configuration needed)';
        }
      } else {
        icon = <PlugZap className="h-4 w-4 text-orange-400" />;
        tooltip = 'Configure server';
      }

      const onClick = () => {
        const serverConfig = startupConfig?.mcpServers?.[serverName];
        if (serverConfig) {
          const serverTool = {
            name: serverName,
            pluginKey: `${Constants.mcp_prefix}${serverName}`,
            authConfig: Object.entries(serverConfig.customUserVars || {}).map(([key, config]) => ({
              authField: key,
              label: config.title,
              description: config.description,
              requiresOAuth: serverConfig.requiresOAuth || false,
            })),
            authenticated: connected,
          };
          setSelectedToolForConfig(serverTool);
          setIsConfigModalOpen(true);
        }
      };

      return (
        <div className="flex w-full items-center justify-between">
          <div className={`flex flex-grow items-center ${!connected ? 'opacity-50' : ''}`}>
            {defaultContent}
          </div>
          {icon && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onClick();
              }}
              className="ml-2 flex h-6 w-6 items-center justify-center rounded p-1 hover:bg-surface-secondary"
              aria-label={tooltip}
              title={tooltip}
            >
              {icon}
            </button>
          )}
        </div>
      );
    },
    [mcpServerStatuses, setSelectedToolForConfig, setIsConfigModalOpen, startupConfig],
  );

  // Memoize schema and initial values to prevent unnecessary re-renders
  const fieldsSchema = useMemo(() => {
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
  }, [selectedToolForConfig?.authConfig]);

  const initialValues = useMemo(() => {
    const initial: Record<string, string> = {};
    // Always start with empty values for security - never prefill sensitive data
    if (selectedToolForConfig?.authConfig) {
      selectedToolForConfig.authConfig.forEach((field) => {
        initial[field.authField] = '';
      });
    }
    return initial;
  }, [selectedToolForConfig?.authConfig]);

  // Don't render if no MCP servers are available at all
  if (!mcpServerStatuses || Object.keys(mcpServerStatuses).length === 0) {
    return null;
  }

  // Don't render if no servers are selected and not pinned
  if ((!mcpValues || mcpValues.length === 0) && !isPinned) {
    return null;
  }

  const placeholderText =
    startupConfig?.interface?.mcpServers?.placeholder || localize('com_ui_mcp_servers');
  return (
    <>
      <MultiSelect
        items={Object.keys(mcpServerStatuses) || []}
        selectedValues={mcpValues ?? []}
        setSelectedValues={handleSetSelectedValues}
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
          fieldsSchema={fieldsSchema}
          initialValues={initialValues}
          onSave={handleSave}
          onRevoke={handleRevoke}
          isSubmitting={updateUserPluginsMutation.isLoading}
          isConnected={mcpServerStatuses?.[selectedToolForConfig.name]?.connected || false}
          authConfig={selectedToolForConfig.authConfig}
        />
      )}
    </>
  );
}

export default memo(MCPSelect);
