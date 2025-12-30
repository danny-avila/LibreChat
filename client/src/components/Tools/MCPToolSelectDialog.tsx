import { useEffect, useState, useMemo } from 'react';
import { Search, X } from 'lucide-react';
import { useFormContext } from 'react-hook-form';
import { useQueryClient } from '@tanstack/react-query';
import { Constants, EModelEndpoint, QueryKeys } from 'librechat-data-provider';
import { Dialog, DialogPanel, DialogTitle, Description } from '@headlessui/react';
import { useUpdateUserPluginsMutation } from 'librechat-data-provider/react-query';
import type { TError, AgentToolType } from 'librechat-data-provider';
import type { AgentForm, ToolDialogProps } from '~/common';
import {
  usePluginDialogHelpers,
  useMCPServerManager,
  useRemoveMCPTool,
  useLocalize,
} from '~/hooks';
import CustomUserVarsSection from '~/components/MCP/CustomUserVarsSection';
import { PluginPagination } from '~/components/Plugins/Store';
import { useAgentPanelContext } from '~/Providers';
import { useMCPToolsQuery } from '~/data-provider';
import MCPToolItem from './MCPToolItem';

function MCPToolSelectDialog({
  isOpen,
  agentId,
  setIsOpen,
  mcpServerNames,
}: ToolDialogProps & {
  agentId: string;
  mcpServerNames?: string[];
  endpoint: EModelEndpoint.agents;
}) {
  const localize = useLocalize();
  const queryClient = useQueryClient();
  const { initializeServer } = useMCPServerManager();
  const { getValues, setValue } = useFormContext<AgentForm>();
  const { removeTool } = useRemoveMCPTool({ showToast: false });
  const { mcpServersMap, availableMCPServersMap } = useAgentPanelContext();
  const { refetch: refetchMCPTools } = useMCPToolsQuery({
    enabled: mcpServersMap.size > 0,
  });

  const [isSavingCustomVars, setIsSavingCustomVars] = useState(false);
  const [isInitializing, setIsInitializing] = useState<string | null>(null);
  const [configuringServer, setConfiguringServer] = useState<string | null>(null);

  const {
    maxPage,
    setMaxPage,
    currentPage,
    setCurrentPage,
    itemsPerPage,
    searchChanged,
    setSearchChanged,
    searchValue,
    setSearchValue,
    gridRef,
    handleSearch,
    handleChangePage,
    error,
    setError,
    errorMessage,
    setErrorMessage,
  } = usePluginDialogHelpers();

  const updateUserPlugins = useUpdateUserPluginsMutation();

  const handleInstallError = (error: TError) => {
    setError(true);
    const errorMessage = error.response?.data?.message ?? '';
    if (errorMessage) {
      setErrorMessage(errorMessage);
    }
    setTimeout(() => {
      setError(false);
      setErrorMessage('');
    }, 5000);
  };

  const handleDirectAdd = async (serverName: string, authData?: Record<string, string>) => {
    try {
      setIsInitializing(serverName);

      // First, save auth if provided
      if (authData && Object.keys(authData).length > 0) {
        await updateUserPlugins.mutateAsync({
          pluginKey: `${Constants.mcp_prefix}${serverName}`,
          action: 'install',
          auth: authData,
          isEntityTool: true,
        });

        // Invalidate auth values query to ensure fresh data
        await queryClient.invalidateQueries([QueryKeys.mcpAuthValues, serverName]);

        // Small delay to ensure backend has processed the auth
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      // Then initialize server if needed
      const serverInfo = mcpServersMap.get(serverName);
      if (!serverInfo?.isConnected) {
        const result = await initializeServer(serverName);
        if (result?.success && result.oauthRequired && result.oauthUrl) {
          setIsInitializing(null);
          return;
        }
      }

      // Finally, add tools to form
      await addToolsToForm(serverName);
      setIsInitializing(null);
    } catch (error) {
      console.error('Error adding MCP server:', error);
      handleInstallError(error as TError);
      setIsInitializing(null);
    }
  };

  const addToolsToForm = async (serverName: string) => {
    const { data: updatedMCPData } = await refetchMCPTools();

    const currentTools = getValues('tools') || [];
    const toolsToAdd: string[] = [`${Constants.mcp_server}${Constants.mcp_delimiter}${serverName}`];

    if (updatedMCPData?.servers?.[serverName]) {
      const serverData = updatedMCPData.servers[serverName];
      serverData.tools.forEach((tool) => {
        toolsToAdd.push(tool.pluginKey);
      });
    }

    const newTools = toolsToAdd.filter((tool) => !currentTools.includes(tool));
    if (newTools.length > 0) {
      setValue('tools', [...currentTools, ...newTools]);
    }
  };

  const handleSaveCustomVars = async (serverName: string, authData: Record<string, string>) => {
    try {
      setIsSavingCustomVars(true);

      // Filter out empty values to avoid overwriting existing values with empty ones
      const filteredAuthData: Record<string, string> = {};
      Object.entries(authData).forEach(([key, value]) => {
        if (value && value.trim()) {
          filteredAuthData[key] = value.trim();
        }
      });

      // Always add the tool, but only pass auth data if there are values to save
      // Empty auth data is fine - the tool can work without credentials
      await handleDirectAdd(
        serverName,
        Object.keys(filteredAuthData).length > 0 ? filteredAuthData : undefined,
      );
      setConfiguringServer(null);
    } catch (error) {
      console.error('Error saving custom vars:', error);
      handleInstallError(error as TError);
    } finally {
      setIsSavingCustomVars(false);
    }
  };

  const handleRevokeCustomVars = (serverName: string) => {
    setIsSavingCustomVars(true);
    updateUserPlugins.mutate(
      {
        pluginKey: `${Constants.mcp_prefix}${serverName}`,
        action: 'uninstall',
        auth: {},
        isEntityTool: true,
      },
      {
        onError: (error: unknown) => {
          handleInstallError(error as TError);
          setIsSavingCustomVars(false);
        },
        onSuccess: async () => {
          setConfiguringServer(null);
          setIsSavingCustomVars(false);
        },
      },
    );
  };

  const onAddTool = async (serverName: string) => {
    if (configuringServer === serverName) {
      setConfiguringServer(null);
      await handleDirectAdd(serverName);
      return;
    }

    const serverConfig = availableMCPServersMap?.[serverName];
    const hasCustomUserVars =
      serverConfig?.customUserVars && Object.keys(serverConfig.customUserVars).length > 0;

    if (hasCustomUserVars) {
      setConfiguringServer(serverName);
    } else {
      await handleDirectAdd(serverName);
    }
  };

  const installedToolsSet = useMemo(() => {
    return new Set(mcpServerNames);
  }, [mcpServerNames]);

  const mcpServers = useMemo(() => {
    const servers = Array.from(mcpServersMap.values()).filter((s) => !s.consumeOnly);
    return servers.sort((a, b) => a.serverName.localeCompare(b.serverName));
  }, [mcpServersMap]);

  const filteredServers = useMemo(() => {
    if (!searchValue) {
      return mcpServers;
    }
    return mcpServers.filter((serverInfo) =>
      serverInfo.serverName.toLowerCase().includes(searchValue.toLowerCase()),
    );
  }, [mcpServers, searchValue]);

  useEffect(() => {
    setMaxPage(Math.ceil(filteredServers.length / itemsPerPage));
    if (searchChanged) {
      setCurrentPage(1);
      setSearchChanged(false);
    }
  }, [
    setMaxPage,
    itemsPerPage,
    searchChanged,
    setCurrentPage,
    setSearchChanged,
    filteredServers.length,
  ]);

  return (
    <Dialog
      open={isOpen}
      onClose={() => {
        setIsOpen(false);
        setCurrentPage(1);
        setSearchValue('');
        setConfiguringServer(null);
        setIsInitializing(null);
      }}
      className="relative z-[102]"
    >
      <div className="fixed inset-0 bg-surface-primary opacity-60 transition-opacity dark:opacity-80" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel
          className="relative max-h-[90vh] w-full transform overflow-hidden overflow-y-auto rounded-lg bg-surface-secondary text-left shadow-xl transition-all max-sm:h-full sm:mx-7 sm:my-8 sm:max-w-2xl lg:max-w-5xl xl:max-w-7xl"
          style={{ minHeight: '610px' }}
        >
          <div className="flex items-center justify-between border-b-[1px] border-border-medium px-4 pb-4 pt-5 sm:p-6">
            <div className="flex items-center">
              <div className="text-center sm:text-left">
                <DialogTitle className="text-lg font-medium leading-6 text-text-primary">
                  {localize('com_nav_tool_dialog_mcp_server_tools')}
                </DialogTitle>
                <Description className="text-sm text-text-secondary">
                  {localize('com_nav_tool_dialog_description')}
                </Description>
              </div>
            </div>
            <div>
              <button
                onClick={() => {
                  setIsOpen(false);
                  setCurrentPage(1);
                  setConfiguringServer(null);
                  setIsInitializing(null);
                }}
                className="inline-block rounded-full text-text-secondary transition-colors hover:text-text-primary"
                aria-label="Close dialog"
                type="button"
              >
                <X aria-hidden="true" />
              </button>
            </div>
          </div>

          {error && (
            <div
              className="relative m-4 rounded border border-red-400 bg-red-100 px-4 py-3 text-red-700"
              role="alert"
            >
              {localize('com_nav_plugin_auth_error')} {errorMessage}
            </div>
          )}

          {configuringServer && (
            <div className="p-4 sm:p-6 sm:pt-4">
              <div className="mb-4">
                <p className="text-sm text-text-secondary">
                  {localize('com_ui_mcp_configure_server_description', { 0: configuringServer })}
                </p>
              </div>
              <CustomUserVarsSection
                serverName={configuringServer}
                isSubmitting={isSavingCustomVars}
                fields={availableMCPServersMap?.[configuringServer]?.customUserVars || {}}
                onSave={(authData) => handleSaveCustomVars(configuringServer, authData)}
                onRevoke={() => handleRevokeCustomVars(configuringServer)}
              />
            </div>
          )}

          <div className="p-4 sm:p-6 sm:pt-4">
            <div className="mt-4 flex flex-col gap-4">
              <div
                className="flex items-center justify-center space-x-4"
                onClick={() => setConfiguringServer(null)}
              >
                <Search className="h-6 w-6 text-text-tertiary" />
                <input
                  type="text"
                  value={searchValue}
                  onChange={handleSearch}
                  placeholder={localize('com_nav_tool_search')}
                  className="w-64 rounded border border-border-medium bg-transparent px-2 py-1 text-text-primary focus:outline-none"
                />
              </div>

              <div
                ref={gridRef}
                className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
                style={{ minHeight: '410px' }}
              >
                {filteredServers
                  .slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
                  .map((serverInfo) => {
                    const isInstalled = installedToolsSet.has(serverInfo.serverName);
                    const isConfiguring = configuringServer === serverInfo.serverName;
                    const isServerInitializing = isInitializing === serverInfo.serverName;

                    const tool: AgentToolType = {
                      agent_id: agentId,
                      tool_id: serverInfo.serverName,
                      metadata: {
                        ...serverInfo.metadata,
                      },
                    };

                    return (
                      <MCPToolItem
                        tool={tool}
                        isInstalled={isInstalled}
                        key={serverInfo.serverName}
                        isConfiguring={isConfiguring}
                        isInitializing={isServerInitializing}
                        onAddTool={() => onAddTool(serverInfo.serverName)}
                        onRemoveTool={() => removeTool(serverInfo.serverName)}
                      />
                    );
                  })}
              </div>
            </div>

            <div className="mt-2 flex flex-col items-center gap-2 sm:flex-row sm:justify-between">
              {maxPage > 0 ? (
                <PluginPagination
                  currentPage={currentPage}
                  maxPage={maxPage}
                  onChangePage={handleChangePage}
                />
              ) : (
                <div style={{ height: '21px' }}></div>
              )}
            </div>
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  );
}

export default MCPToolSelectDialog;
