import { useEffect } from 'react';
import { Search, X } from 'lucide-react';
import { useFormContext } from 'react-hook-form';
import { Constants, isAgentsEndpoint } from 'librechat-data-provider';
import { Dialog, DialogPanel, DialogTitle, Description } from '@headlessui/react';
import { useUpdateUserPluginsMutation } from 'librechat-data-provider/react-query';
import type {
  AssistantsEndpoint,
  EModelEndpoint,
  TPluginAction,
  AgentToolType,
  TError,
} from 'librechat-data-provider';
import type { AgentForm, TPluginStoreDialogProps } from '~/common';
import { PluginPagination, PluginAuthForm } from '~/components/Plugins/Store';
import { useAgentPanelContext } from '~/Providers/AgentPanelContext';
import { useLocalize, usePluginDialogHelpers } from '~/hooks';
import { useAvailableToolsQuery } from '~/data-provider';
import ToolItem from './ToolItem';

function ToolSelectDialog({
  isOpen,
  endpoint,
  setIsOpen,
}: TPluginStoreDialogProps & {
  endpoint: AssistantsEndpoint | EModelEndpoint.agents;
}) {
  const localize = useLocalize();
  const { getValues, setValue } = useFormContext<AgentForm>();
  const { data: tools } = useAvailableToolsQuery(endpoint);
  const { groupedTools } = useAgentPanelContext();
  const isAgentTools = isAgentsEndpoint(endpoint);

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
    showPluginAuthForm,
    setShowPluginAuthForm,
    selectedPlugin,
    setSelectedPlugin,
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

  const handleInstall = (pluginAction: TPluginAction) => {
    const addFunction = () => {
      const installedToolIds: string[] = getValues('tools') || [];
      // Add the parent
      installedToolIds.push(pluginAction.pluginKey);

      // If this tool is a group, add subtools too
      const groupObj = groupedTools?.[pluginAction.pluginKey];
      if (groupObj?.tools && groupObj.tools.length > 0) {
        for (const sub of groupObj.tools) {
          if (!installedToolIds.includes(sub.tool_id)) {
            installedToolIds.push(sub.tool_id);
          }
        }
      }
      setValue('tools', Array.from(new Set(installedToolIds))); // no duplicates just in case
    };

    if (!pluginAction.auth) {
      return addFunction();
    }

    updateUserPlugins.mutate(pluginAction, {
      onError: (error: unknown) => {
        handleInstallError(error as TError);
      },
      onSuccess: addFunction,
    });

    setShowPluginAuthForm(false);
  };

  const onRemoveTool = (toolId: string) => {
    const groupObj = groupedTools?.[toolId];
    const toolIdsToRemove = [toolId];
    if (groupObj?.tools && groupObj.tools.length > 0) {
      toolIdsToRemove.push(...groupObj.tools.map((sub) => sub.tool_id));
    }
    // Remove these from the formTools
    updateUserPlugins.mutate(
      { pluginKey: toolId, action: 'uninstall', auth: {}, isEntityTool: true },
      {
        onError: (error: unknown) => handleInstallError(error as TError),
        onSuccess: () => {
          const remainingToolIds =
            getValues('tools')?.filter((toolId) => !toolIdsToRemove.includes(toolId)) || [];
          setValue('tools', remainingToolIds);
        },
      },
    );
  };

  const onAddTool = (pluginKey: string) => {
    setShowPluginAuthForm(false);
    const getAvailablePluginFromKey = tools?.find((p) => p.pluginKey === pluginKey);
    setSelectedPlugin(getAvailablePluginFromKey);

    const isMCPTool = pluginKey.includes(Constants.mcp_delimiter);

    if (isMCPTool) {
      // MCP tools have their variables configured elsewhere (e.g., MCPPanel or MCPSelect),
      // so we directly proceed to install without showing the auth form.
      handleInstall({ pluginKey, action: 'install', auth: {} });
    } else {
      const { authConfig, authenticated = false } = getAvailablePluginFromKey ?? {};
      if (authConfig && authConfig.length > 0 && !authenticated) {
        setShowPluginAuthForm(true);
      } else {
        handleInstall({
          pluginKey,
          action: 'install',
          auth: {},
        });
      }
    }
  };

  const filteredTools = Object.values(groupedTools || {}).filter(
    (tool: AgentToolType & { tools?: AgentToolType[] }) => {
      // Check if the parent tool matches
      if (tool.metadata?.name?.toLowerCase().includes(searchValue.toLowerCase())) {
        return true;
      }
      // Check if any child tools match
      if (tool.tools) {
        return tool.tools.some((childTool) =>
          childTool.metadata?.name?.toLowerCase().includes(searchValue.toLowerCase()),
        );
      }
      return false;
    },
  );

  useEffect(() => {
    if (filteredTools) {
      setMaxPage(Math.ceil(Object.keys(filteredTools || {}).length / itemsPerPage));
      if (searchChanged) {
        setCurrentPage(1);
        setSearchChanged(false);
      }
    }
  }, [
    tools,
    itemsPerPage,
    searchValue,
    filteredTools,
    searchChanged,
    setMaxPage,
    setCurrentPage,
    setSearchChanged,
  ]);

  return (
    <Dialog
      open={isOpen}
      onClose={() => {
        setIsOpen(false);
        setCurrentPage(1);
        setSearchValue('');
      }}
      className="relative z-[102]"
    >
      {/* The backdrop, rendered as a fixed sibling to the panel container */}
      <div className="fixed inset-0 bg-surface-primary opacity-60 transition-opacity dark:opacity-80" />
      {/* Full-screen container to center the panel */}
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel
          className="relative max-h-[90vh] w-full transform overflow-hidden overflow-y-auto rounded-lg bg-surface-secondary text-left shadow-xl transition-all max-sm:h-full sm:mx-7 sm:my-8 sm:max-w-2xl lg:max-w-5xl xl:max-w-7xl"
          style={{ minHeight: '610px' }}
        >
          <div className="flex items-center justify-between border-b-[1px] border-border-medium px-4 pb-4 pt-5 sm:p-6">
            <div className="flex items-center">
              <div className="text-center sm:text-left">
                <DialogTitle className="text-lg font-medium leading-6 text-text-primary">
                  {isAgentTools
                    ? localize('com_nav_tool_dialog_agents')
                    : localize('com_nav_tool_dialog')}
                </DialogTitle>
                <Description className="text-sm text-text-secondary">
                  {localize('com_nav_tool_dialog_description')}
                </Description>
              </div>
            </div>
            <div>
              <div className="sm:mt-0">
                <button
                  onClick={() => {
                    setIsOpen(false);
                    setCurrentPage(1);
                  }}
                  className="inline-block rounded-full text-text-secondary transition-colors hover:text-text-primary"
                  aria-label="Close dialog"
                  type="button"
                >
                  <X aria-hidden="true" />
                </button>
              </div>
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
          {showPluginAuthForm && (
            <div className="p-4 sm:p-6 sm:pt-4">
              <PluginAuthForm
                plugin={selectedPlugin}
                onSubmit={(installActionData: TPluginAction) => handleInstall(installActionData)}
                isEntityTool={true}
              />
            </div>
          )}
          <div className="p-4 sm:p-6 sm:pt-4">
            <div className="mt-4 flex flex-col gap-4">
              <div className="flex items-center justify-center space-x-4">
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
                className="grid grid-cols-1 grid-rows-2 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
                style={{ minHeight: '410px' }}
              >
                {filteredTools &&
                  filteredTools
                    .slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
                    .map((tool, index) => (
                      <ToolItem
                        key={index}
                        tool={tool}
                        isInstalled={getValues('tools')?.includes(tool.tool_id) || false}
                        onAddTool={() => onAddTool(tool.tool_id)}
                        onRemoveTool={() => onRemoveTool(tool.tool_id)}
                      />
                    ))}
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

export default ToolSelectDialog;
