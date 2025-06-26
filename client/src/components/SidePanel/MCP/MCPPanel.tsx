import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { ChevronLeft } from 'lucide-react';
import { Constants } from 'librechat-data-provider';
import { useForm, Controller } from 'react-hook-form';
import { useUpdateUserPluginsMutation } from 'librechat-data-provider/react-query';
import type { TUpdateUserPlugins } from 'librechat-data-provider';
import { Button, Input, Label } from '~/components/ui';
import { useGetStartupConfig } from '~/data-provider';
import { useAddToolMutation } from '~/data-provider/Tools';
import MCPPanelSkeleton from './MCPPanelSkeleton';
import { useToastContext } from '~/Providers';
import { useLocalize } from '~/hooks';

interface ServerConfigWithVars {
  serverName: string;
  config: {
    customUserVars: Record<string, { title: string; description: string }>;
  };
}

interface AddToolFormData {
  name: string;
  description: string;
  type: 'function' | 'code_interpreter' | 'file_search';
}

export default function MCPPanel() {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const { data: startupConfig, isLoading: startupConfigLoading } = useGetStartupConfig();
  const [selectedServerNameForEditing, setSelectedServerNameForEditing] = useState<string | null>(
    null,
  );
  const [showAddToolForm, setShowAddToolForm] = useState(true);

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
    setShowAddToolForm(false);
  };

  const handleShowAddToolForm = () => {
    setShowAddToolForm(true);
    setSelectedServerNameForEditing(null);
  };

  if (startupConfigLoading) {
    return <MCPPanelSkeleton />;
  }

  // if (mcpServerDefinitions.length === 0) {
  //   return (
  //     <div className="p-4 text-center text-sm text-gray-500">
  //       {localize('com_sidepanel_mcp_no_servers_with_vars')}
  //     </div>
  //   );
  // }

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
  } else if (showAddToolForm) {
    // Add Tool Form View
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
        <h3 className="mb-3 text-lg font-medium">{localize('com_ui_add_tool')}</h3>
        <AddToolForm onCancel={handleGoBackToList} />
      </div>
    );
  } else {
    // Server List View
    return (
      <div className="h-auto max-w-full overflow-x-hidden p-3">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-medium">{localize('com_ui_mcp_servers')}</h3>
          <Button variant="outline" onClick={handleShowAddToolForm} className="text-sm">
            {localize('com_ui_add_tool')}
          </Button>
        </div>
        <div className="space-y-2">
          {mcpServerDefinitions.map((server) => (
            <Button
              key={server.serverName}
              variant="outline"
              className="w-full justify-start dark:hover:bg-gray-700"
              onClick={() => handleServerClickToEdit(server.serverName)}
            >
              {server.serverName}
            </Button>
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

interface AddToolFormProps {
  onCancel: () => void;
}

function AddToolForm({ onCancel }: AddToolFormProps) {
  const localize = useLocalize();
  const { showToast } = useToastContext();

  const addToolMutation = useAddToolMutation({
    onSuccess: (data) => {
      showToast({
        message: localize('com_ui_tool_added_success', { '0': data.function?.name || 'Unknown' }),
        status: 'success',
      });
      onCancel();
    },
    onError: (error) => {
      console.error('Error adding tool:', error);
      showToast({
        message: localize('com_ui_tool_add_error'),
        status: 'error',
      });
    },
  });

  const {
    control,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<AddToolFormData>({
    defaultValues: {
      name: '',
      description: '',
      type: 'function',
    },
  });

  const onFormSubmit = (data: AddToolFormData) => {
    addToolMutation.mutate(data);
  };

  return (
    <form onSubmit={handleSubmit(onFormSubmit)} className="mb-4 mt-2 space-y-4">
      <div className="space-y-2">
        <Label htmlFor="tool-name" className="text-sm font-medium">
          {localize('com_ui_tool_name')}
        </Label>
        <Controller
          name="name"
          control={control}
          rules={{ required: localize('com_ui_tool_name_required') }}
          render={({ field }) => (
            <Input
              id="tool-name"
              type="text"
              {...field}
              placeholder={localize('com_ui_enter_tool_name')}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white sm:text-sm"
            />
          )}
        />
        {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="tool-description" className="text-sm font-medium">
          {localize('com_ui_description')}
        </Label>
        <Controller
          name="description"
          control={control}
          rules={{ required: localize('com_ui_description_required') }}
          render={({ field }) => (
            <Input
              id="tool-description"
              type="text"
              {...field}
              placeholder={localize('com_ui_enter_description')}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white sm:text-sm"
            />
          )}
        />
        {errors.description && <p className="text-xs text-red-500">{errors.description.message}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="tool-type" className="text-sm font-medium">
          {localize('com_ui_tool_type')}
        </Label>
        <Controller
          name="type"
          control={control}
          render={({ field }) => (
            <select
              id="tool-type"
              {...field}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white sm:text-sm"
            >
              <option value="function">{localize('com_ui_function')}</option>
              <option value="code_interpreter">{localize('com_ui_code_interpreter')}</option>
              <option value="file_search">{localize('com_ui_file_search')}</option>
            </select>
          )}
        />
        {errors.type && <p className="text-xs text-red-500">{errors.type.message}</p>}
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={addToolMutation.isLoading}
        >
          {localize('com_ui_cancel')}
        </Button>
        <Button
          type="submit"
          className="bg-green-500 text-white hover:bg-green-600"
          disabled={addToolMutation.isLoading || !isDirty}
        >
          {addToolMutation.isLoading ? localize('com_ui_saving') : localize('com_ui_save')}
        </Button>
      </div>
    </form>
  );
}
