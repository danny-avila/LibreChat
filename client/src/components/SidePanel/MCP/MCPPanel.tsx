import { Constants } from 'librechat-data-provider';
import { ChevronLeft, RefreshCw } from 'lucide-react';
import { useForm, Controller } from 'react-hook-form';
import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  useUpdateUserPluginsMutation,
  useReinitializeMCPServerMutation,
} from 'librechat-data-provider/react-query';
import type { TUpdateUserPlugins } from 'librechat-data-provider';
import { Button, Input, Label } from '~/components/ui';
import { useGetStartupConfig } from '~/data-provider';
import MCPPanelSkeleton from './MCPPanelSkeleton';
import { useToastContext } from '~/Providers';
import { useLocalize } from '~/hooks';

interface ServerConfigWithVars {
  serverName: string;
  config: {
    customUserVars: Record<string, { title: string; description: string }>;
  };
}

export default function MCPPanel() {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const { data: startupConfig, isLoading: startupConfigLoading } = useGetStartupConfig();
  const [selectedServerNameForEditing, setSelectedServerNameForEditing] = useState<string | null>(
    null,
  );
  const [rotatingServers, setRotatingServers] = useState<Set<string>>(new Set());
  const reinitializeMCPMutation = useReinitializeMCPServerMutation();

  const mcpServerDefinitions = useMemo(() => {
    if (!startupConfig?.mcpServers) {
      return [];
    }
    return Object.entries(startupConfig.mcpServers)
      .filter(
        ([, serverConfig]) =>
          serverConfig.customUserVars && Object.keys(serverConfig.customUserVars).length > 0,
      )
      .map(([serverName, config]) => ({
        serverName,
        iconPath: null,
        config: {
          ...config,
          customUserVars: config.customUserVars ?? {},
        },
      }));
  }, [startupConfig?.mcpServers]);

  const updateUserPluginsMutation = useUpdateUserPluginsMutation({
    onSuccess: () => {
      showToast({ message: localize('com_nav_mcp_vars_updated'), status: 'success' });
    },
    onError: (error) => {
      console.error('Error updating MCP custom user variables:', error);
      showToast({
        message: localize('com_nav_mcp_vars_update_error'),
        status: 'error',
      });
    },
  });

  const handleSaveServerVars = useCallback(
    (serverName: string, updatedValues: Record<string, string>) => {
      const payload: TUpdateUserPlugins = {
        pluginKey: `${Constants.mcp_prefix}${serverName}`,
        action: 'install', // 'install' action is used to set/update credentials/variables
        auth: updatedValues,
      };
      updateUserPluginsMutation.mutate(payload);
    },
    [updateUserPluginsMutation],
  );

  const handleRevokeServerVars = useCallback(
    (serverName: string) => {
      const payload: TUpdateUserPlugins = {
        pluginKey: `${Constants.mcp_prefix}${serverName}`,
        action: 'uninstall', // 'uninstall' action clears the variables
        auth: {}, // Empty auth for uninstall
      };
      updateUserPluginsMutation.mutate(payload);
    },
    [updateUserPluginsMutation],
  );

  const handleServerClickToEdit = (serverName: string) => {
    setSelectedServerNameForEditing(serverName);
  };

  const handleGoBackToList = () => {
    setSelectedServerNameForEditing(null);
  };

  const handleReinitializeServer = useCallback(
    async (serverName: string) => {
      setRotatingServers((prev) => new Set(prev).add(serverName));
      try {
        await reinitializeMCPMutation.mutateAsync(serverName);
        showToast({
          message: `MCP server '${serverName}' reinitialized successfully`,
          status: 'success',
        });
      } catch (error) {
        console.error('Error reinitializing MCP server:', error);
        showToast({
          message: 'Failed to reinitialize MCP server',
          status: 'error',
        });
      } finally {
        setRotatingServers((prev) => {
          const next = new Set(prev);
          next.delete(serverName);
          return next;
        });
      }
    },
    [showToast, reinitializeMCPMutation],
  );

  if (startupConfigLoading) {
    return <MCPPanelSkeleton />;
  }

  if (mcpServerDefinitions.length === 0) {
    return (
      <div className="p-4 text-center text-sm text-gray-500">
        {localize('com_sidepanel_mcp_no_servers_with_vars')}
      </div>
    );
  }

  if (selectedServerNameForEditing) {
    // Editing View
    const serverBeingEdited = mcpServerDefinitions.find(
      (s) => s.serverName === selectedServerNameForEditing,
    );

    if (!serverBeingEdited) {
      // Fallback to list view if server not found
      setSelectedServerNameForEditing(null);
      return (
        <div className="p-4 text-center text-sm text-gray-500">
          {localize('com_ui_error')}: {localize('com_ui_mcp_server_not_found')}
        </div>
      );
    }

    return (
      <div className="h-auto max-w-full overflow-x-hidden p-3">
        <Button
          variant="outline"
          onClick={handleGoBackToList}
          className="mb-3 flex items-center px-3 py-2 text-sm"
        >
          <ChevronLeft className="mr-1 h-4 w-4" />
          {localize('com_ui_back')}
        </Button>
        <h3 className="mb-3 text-lg font-medium">
          {localize('com_sidepanel_mcp_variables_for', { '0': serverBeingEdited.serverName })}
        </h3>
        <MCPVariableEditor
          server={serverBeingEdited}
          onSave={handleSaveServerVars}
          onRevoke={handleRevokeServerVars}
          isSubmitting={updateUserPluginsMutation.isLoading}
        />
      </div>
    );
  } else {
    // Server List View
    return (
      <div className="h-auto max-w-full overflow-x-hidden p-3">
        <div className="space-y-2">
          {mcpServerDefinitions.map((server) => (
            <div key={server.serverName} className="flex items-center gap-2">
              <Button
                variant="outline"
                className="flex-1 justify-start dark:hover:bg-gray-700"
                onClick={() => handleServerClickToEdit(server.serverName)}
              >
                {server.serverName}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleReinitializeServer(server.serverName)}
                className="px-2 py-1"
                title="Reinitialize MCP server"
                disabled={reinitializeMCPMutation.isLoading}
              >
                <RefreshCw
                  className={`h-4 w-4 ${rotatingServers.has(server.serverName) ? 'animate-spin' : ''}`}
                />
              </Button>
            </div>
          ))}
        </div>
      </div>
    );
  }
}

// Inner component for the form - remains the same
interface MCPVariableEditorProps {
  server: ServerConfigWithVars;
  onSave: (serverName: string, updatedValues: Record<string, string>) => void;
  onRevoke: (serverName: string) => void;
  isSubmitting: boolean;
}

function MCPVariableEditor({ server, onSave, onRevoke, isSubmitting }: MCPVariableEditorProps) {
  const localize = useLocalize();

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<Record<string, string>>({
    defaultValues: {}, // Initialize empty, will be reset by useEffect
  });

  useEffect(() => {
    // Always initialize with empty strings based on the schema
    const initialFormValues = Object.keys(server.config.customUserVars).reduce(
      (acc, key) => {
        acc[key] = '';
        return acc;
      },
      {} as Record<string, string>,
    );
    reset(initialFormValues);
  }, [reset, server.config.customUserVars]);

  const onFormSubmit = (data: Record<string, string>) => {
    onSave(server.serverName, data);
  };

  const handleRevokeClick = () => {
    onRevoke(server.serverName);
  };

  return (
    <form onSubmit={handleSubmit(onFormSubmit)} className="mb-4 mt-2 space-y-4">
      {Object.entries(server.config.customUserVars).map(([key, details]) => (
        <div key={key} className="space-y-2">
          <Label htmlFor={`${server.serverName}-${key}`} className="text-sm font-medium">
            {details.title}
          </Label>
          <Controller
            name={key}
            control={control}
            defaultValue={''}
            render={({ field }) => (
              <Input
                id={`${server.serverName}-${key}`}
                type="text"
                {...field}
                placeholder={localize('com_sidepanel_mcp_enter_value', { '0': details.title })}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white sm:text-sm"
              />
            )}
          />
          {details.description && (
            <p
              className="text-xs text-text-secondary [&_a]:text-blue-500 [&_a]:hover:text-blue-600 dark:[&_a]:text-blue-400 dark:[&_a]:hover:text-blue-300"
              dangerouslySetInnerHTML={{ __html: details.description }}
            />
          )}
          {errors[key] && <p className="text-xs text-red-500">{errors[key]?.message}</p>}
        </div>
      ))}
      <div className="flex justify-end gap-2 pt-2">
        {Object.keys(server.config.customUserVars).length > 0 && (
          <Button
            type="button"
            onClick={handleRevokeClick}
            className="bg-red-600 text-white hover:bg-red-700 dark:hover:bg-red-800"
            disabled={isSubmitting}
          >
            {localize('com_ui_revoke')}
          </Button>
        )}
        <Button
          type="submit"
          className="bg-green-500 text-white hover:bg-green-600"
          disabled={isSubmitting || !isDirty}
        >
          {isSubmitting ? localize('com_ui_saving') : localize('com_ui_save')}
        </Button>
      </div>
    </form>
  );
}
