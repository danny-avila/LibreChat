import { useEffect } from 'react';
import { Search, X } from 'lucide-react';
import { useFormContext } from 'react-hook-form';
import { isAgentsEndpoint } from 'librechat-data-provider';
import { Dialog, DialogPanel, DialogTitle, Description } from '@headlessui/react';
import { useUpdateUserPluginsMutation } from 'librechat-data-provider/react-query';
import type {
  AssistantsEndpoint,
  EModelEndpoint,
  TPluginAction,
  TPlugin,
  TError,
} from 'librechat-data-provider';
import type { AgentForm, ToolDialogProps } from '~/common';
import { PluginPagination, PluginAuthForm } from '~/components/Plugins/Store';
import { useAgentPanelContext } from '~/Providers/AgentPanelContext';
import { useLocalize, usePluginDialogHelpers } from '~/hooks';
import ToolItem from './ToolItem';

function ToolSelectDialog({
  isOpen,
  endpoint,
  setIsOpen,
}: ToolDialogProps & {
  endpoint: AssistantsEndpoint | EModelEndpoint.agents;
}) {
  const localize = useLocalize();
  const isAgentTools = isAgentsEndpoint(endpoint);
  const { getValues, setValue } = useFormContext<AgentForm>();
  // Only use regular tools, not MCP tools
  const { regularTools } = useAgentPanelContext();

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
      installedToolIds.push(pluginAction.pluginKey);
      setValue('tools', Array.from(new Set(installedToolIds)));
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
    updateUserPlugins.mutate(
      { pluginKey: toolId, action: 'uninstall', auth: {}, isEntityTool: true },
      {
        onError: (error: unknown) => handleInstallError(error as TError),
        onSuccess: () => {
          const remainingToolIds = getValues('tools')?.filter((id) => id !== toolId) || [];
          setValue('tools', remainingToolIds);
        },
      },
    );
  };

  const onAddTool = (pluginKey: string) => {
    setShowPluginAuthForm(false);
    // Find the tool in regularTools
    const availablePluginFromKey = regularTools?.find((p) => p.pluginKey === pluginKey);
    setSelectedPlugin(availablePluginFromKey);

    const { authConfig, authenticated = false } = availablePluginFromKey ?? {};
    if (authConfig && authConfig.length > 0 && !authenticated) {
      setShowPluginAuthForm(true);
    } else {
      handleInstall({
        pluginKey,
        action: 'install',
        auth: {},
      });
    }
  };

  const filteredTools = (regularTools || []).filter((tool: TPlugin) => {
    return tool.name?.toLowerCase().includes(searchValue.toLowerCase());
  });

  useEffect(() => {
    if (filteredTools) {
      setMaxPage(Math.ceil(filteredTools.length / itemsPerPage));
      if (searchChanged) {
        setCurrentPage(1);
        setSearchChanged(false);
      }
    }
  }, [
    searchValue,
    itemsPerPage,
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
                        tool={{
                          tool_id: tool.pluginKey,
                          metadata: tool,
                        }}
                        isInstalled={getValues('tools')?.includes(tool.pluginKey) || false}
                        onAddTool={() => onAddTool(tool.pluginKey)}
                        onRemoveTool={() => onRemoveTool(tool.pluginKey)}
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
