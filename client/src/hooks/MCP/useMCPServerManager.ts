import { useQueryClient } from '@tanstack/react-query';
import { Constants, QueryKeys } from 'librechat-data-provider';
import { useCallback, useState, useMemo, useRef } from 'react';
import { useUpdateUserPluginsMutation } from 'librechat-data-provider/react-query';
import { useMCPServerInitialization } from '~/hooks/MCP/useMCPServerInitialization';
import type { ConfigFieldDetail } from '~/components/ui/MCP/MCPConfigDialog';
import type { TUpdateUserPlugins, TPlugin } from 'librechat-data-provider';
import { useToastContext, useBadgeRowContext } from '~/Providers';
import { useLocalize } from '~/hooks';

export function useMCPServerManager() {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const { mcpSelect, startupConfig } = useBadgeRowContext();
  const { mcpValues, setMCPValues, mcpToolDetails, isPinned, setIsPinned } = mcpSelect;

  const configuredServers = useMemo(() => {
    if (!startupConfig?.mcpServers) {
      return [];
    }
    return Object.entries(startupConfig.mcpServers)
      .filter(([, config]) => config.chatMenu !== false)
      .map(([serverName]) => serverName);
  }, [startupConfig?.mcpServers]);

  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [selectedToolForConfig, setSelectedToolForConfig] = useState<TPlugin | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const queryClient = useQueryClient();

  const updateUserPluginsMutation = useUpdateUserPluginsMutation({
    onSuccess: async () => {
      showToast({ message: localize('com_nav_mcp_vars_updated'), status: 'success' });

      await Promise.all([
        queryClient.refetchQueries([QueryKeys.tools]),
        queryClient.refetchQueries([QueryKeys.mcpAuthValues]),
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

  const { initializeServer, isInitializing, connectionStatus, cancelOAuthFlow, isCancellable } =
    useMCPServerInitialization({
      onSuccess: (serverName) => {
        const currentValues = mcpValues ?? [];
        if (!currentValues.includes(serverName)) {
          setMCPValues([...currentValues, serverName]);
        }
      },
      onError: (serverName) => {
        const tool = mcpToolDetails?.find((t) => t.name === serverName);
        const serverConfig = startupConfig?.mcpServers?.[serverName];
        const serverStatus = connectionStatus[serverName];

        const hasAuthConfig =
          (tool?.authConfig && tool.authConfig.length > 0) ||
          (serverConfig?.customUserVars && Object.keys(serverConfig.customUserVars).length > 0);

        const wouldShowButton =
          !serverStatus ||
          serverStatus.connectionState === 'disconnected' ||
          serverStatus.connectionState === 'error' ||
          (serverStatus.connectionState === 'connected' && hasAuthConfig);

        if (!wouldShowButton) {
          return;
        }

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

        previousFocusRef.current = document.activeElement as HTMLElement;

        setSelectedToolForConfig(configTool);
        setIsConfigModalOpen(true);
      },
    });

  const handleConfigSave = useCallback(
    (targetName: string, authData: Record<string, string>) => {
      if (selectedToolForConfig && selectedToolForConfig.name === targetName) {
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
        const payload: TUpdateUserPlugins = {
          pluginKey: `${Constants.mcp_prefix}${targetName}`,
          action: 'uninstall',
          auth: {},
        };
        updateUserPluginsMutation.mutate(payload);

        const currentValues = mcpValues ?? [];
        const filteredValues = currentValues.filter((name) => name !== targetName);
        setMCPValues(filteredValues);
      }
    },
    [selectedToolForConfig, updateUserPluginsMutation, mcpValues, setMCPValues],
  );

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

  const handleDialogOpenChange = useCallback((open: boolean) => {
    setIsConfigModalOpen(open);

    if (!open && previousFocusRef.current) {
      setTimeout(() => {
        if (previousFocusRef.current && typeof previousFocusRef.current.focus === 'function') {
          previousFocusRef.current.focus();
        }
        previousFocusRef.current = null;
      }, 0);
    }
  }, []);

  const toggleServerSelection = useCallback(
    (serverName: string) => {
      const currentValues = mcpValues ?? [];
      const serverStatus = connectionStatus[serverName];

      if (currentValues.includes(serverName)) {
        const filteredValues = currentValues.filter((name) => name !== serverName);
        setMCPValues(filteredValues);
      } else {
        if (serverStatus?.connectionState === 'connected') {
          setMCPValues([...currentValues, serverName]);
        } else {
          initializeServer(serverName);
        }
      }
    },
    [connectionStatus, mcpValues, setMCPValues, initializeServer],
  );

  const batchToggleServers = useCallback(
    (serverNames: string[]) => {
      const connectedServers: string[] = [];
      const disconnectedServers: string[] = [];

      serverNames.forEach((serverName) => {
        const serverStatus = connectionStatus[serverName];
        if (serverStatus?.connectionState === 'connected') {
          connectedServers.push(serverName);
        } else {
          disconnectedServers.push(serverName);
        }
      });

      setMCPValues(connectedServers);

      disconnectedServers.forEach((serverName) => {
        initializeServer(serverName);
      });
    },
    [connectionStatus, setMCPValues, initializeServer],
  );

  const getServerStatusIconProps = useCallback(
    (serverName: string) => {
      const tool = mcpToolDetails?.find((t) => t.name === serverName);
      const serverStatus = connectionStatus[serverName];
      const serverConfig = startupConfig?.mcpServers?.[serverName];

      const handleConfigClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();

        previousFocusRef.current = document.activeElement as HTMLElement;

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

      const handleCancelClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        cancelOAuthFlow(serverName);
      };

      const hasCustomUserVars =
        serverConfig?.customUserVars && Object.keys(serverConfig.customUserVars).length > 0;

      return {
        serverName,
        serverStatus,
        tool,
        onConfigClick: handleConfigClick,
        isInitializing: isInitializing(serverName),
        canCancel: isCancellable(serverName),
        onCancel: handleCancelClick,
        hasCustomUserVars,
      };
    },
    [
      mcpToolDetails,
      connectionStatus,
      startupConfig?.mcpServers,
      isInitializing,
      isCancellable,
      cancelOAuthFlow,
    ],
  );

  const placeholderText = useMemo(
    () => startupConfig?.interface?.mcpServers?.placeholder || localize('com_ui_mcp_servers'),
    [startupConfig?.interface?.mcpServers?.placeholder, localize],
  );

  const getConfigDialogProps = useCallback(() => {
    if (!selectedToolForConfig) return null;

    const fieldsSchema: Record<string, ConfigFieldDetail> = {};
    if (selectedToolForConfig?.authConfig) {
      selectedToolForConfig.authConfig.forEach((field) => {
        fieldsSchema[field.authField] = {
          title: field.label || field.authField,
          description: field.description,
        };
      });
    }

    const initialValues: Record<string, string> = {};
    if (selectedToolForConfig?.authConfig) {
      selectedToolForConfig.authConfig.forEach((field) => {
        initialValues[field.authField] = '';
      });
    }

    return {
      serverName: selectedToolForConfig.name,
      serverStatus: connectionStatus[selectedToolForConfig.name],
      isOpen: isConfigModalOpen,
      onOpenChange: handleDialogOpenChange,
      fieldsSchema,
      initialValues,
      onSave: handleSave,
      onRevoke: handleRevoke,
      isSubmitting: updateUserPluginsMutation.isLoading,
    };
  }, [
    selectedToolForConfig,
    connectionStatus,
    isConfigModalOpen,
    handleDialogOpenChange,
    handleSave,
    handleRevoke,
    updateUserPluginsMutation.isLoading,
  ]);

  return {
    // Data
    configuredServers,
    mcpValues,
    mcpToolDetails,
    isPinned,
    setIsPinned,
    startupConfig,
    connectionStatus,
    placeholderText,

    // Handlers
    toggleServerSelection,
    batchToggleServers,
    getServerStatusIconProps,

    // Dialog state
    selectedToolForConfig,
    isConfigModalOpen,
    getConfigDialogProps,

    // Utilities
    localize,
  };
}
