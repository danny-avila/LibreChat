import { Search, X } from 'lucide-react';
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import { useState, useEffect, useCallback } from 'react';
import { useAvailablePluginsQuery } from 'librechat-data-provider/react-query';
import type { TError, TPlugin, TPluginAction } from 'librechat-data-provider';
import type { TPluginStoreDialogProps } from '~/common/types';
import {
  usePluginDialogHelpers,
  useSetIndexOptions,
  usePluginInstall,
  useAuthContext,
  useLocalize,
} from '~/hooks';
import PluginPagination from './PluginPagination';
import PluginStoreItem from './PluginStoreItem';
import PluginAuthForm from './PluginAuthForm';

function PluginStoreDialog({ isOpen, setIsOpen }: TPluginStoreDialogProps) {
  const localize = useLocalize();
  const { user } = useAuthContext();
  const { data: availablePlugins } = useAvailablePluginsQuery();
  const { setTools } = useSetIndexOptions();

  const [userPlugins, setUserPlugins] = useState<string[]>([]);

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

  const handleInstallError = useCallback(
    (error: TError) => {
      setError(true);
      if (error.response?.data?.message) {
        setErrorMessage(error.response.data.message);
      }
      setTimeout(() => {
        setError(false);
        setErrorMessage('');
      }, 5000);
    },
    [setError, setErrorMessage],
  );

  const { installPlugin, uninstallPlugin } = usePluginInstall({
    onInstallError: handleInstallError,
    onUninstallError: handleInstallError,
    onUninstallSuccess: (_data, variables) => {
      setTools(variables.pluginKey, true);
    },
  });

  const handleInstall = (pluginAction: TPluginAction, plugin?: TPlugin) => {
    if (!plugin) {
      return;
    }
    installPlugin(pluginAction, plugin);
    setShowPluginAuthForm(false);
  };

  const onPluginInstall = (pluginKey: string) => {
    const plugin = availablePlugins?.find((p) => p.pluginKey === pluginKey);
    if (!plugin) {
      return;
    }
    setSelectedPlugin(plugin);

    const { authConfig, authenticated } = plugin ?? {};

    if (authConfig && authConfig.length > 0 && !authenticated) {
      setShowPluginAuthForm(true);
    } else {
      handleInstall({ pluginKey, action: 'install', auth: null }, plugin);
    }
  };

  const filteredPlugins = availablePlugins?.filter((plugin) =>
    plugin.name.toLowerCase().includes(searchValue.toLowerCase()),
  );

  useEffect(() => {
    if (user && user.plugins) {
      setUserPlugins(user.plugins);
    }

    if (filteredPlugins) {
      setMaxPage(Math.ceil(filteredPlugins.length / itemsPerPage));
      if (searchChanged) {
        setCurrentPage(1);
        setSearchChanged(false);
      }
    }
  }, [
    availablePlugins,
    itemsPerPage,
    user,
    searchValue,
    filteredPlugins,
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
      className="relative z-102"
    >
      {/* The backdrop, rendered as a fixed sibling to the panel container */}
      <div className="fixed inset-0 bg-gray-600/65 transition-opacity dark:bg-black/80" />
      {/* Full-screen container to center the panel */}
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel
          className="relative w-full transform overflow-hidden overflow-y-auto rounded-lg bg-white text-left shadow-xl transition-all dark:bg-gray-700 max-sm:h-full sm:mx-7 sm:my-8 sm:max-w-2xl lg:max-w-5xl xl:max-w-7xl"
          style={{ minHeight: '610px' }}
        >
          <div className="flex items-center justify-between border-b-[1px] border-black/10 p-6 pb-4 dark:border-white/10">
            <div className="flex items-center">
              <div className="text-center sm:text-left">
                <DialogTitle className="text-lg font-medium leading-6 text-gray-800 dark:text-gray-200">
                  {localize('com_nav_plugin_store')}
                </DialogTitle>
              </div>
            </div>
            <div>
              <div className="sm:mt-0">
                <button
                  onClick={() => {
                    setIsOpen(false);
                    setCurrentPage(1);
                  }}
                  className="inline-block text-gray-500 hover:text-gray-200"
                  tabIndex={0}
                >
                  <X />
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
                onSubmit={(action: TPluginAction) => handleInstall(action, selectedPlugin)}
              />
            </div>
          )}
          <div className="p-4 sm:p-6 sm:pt-4">
            <div className="mt-4 flex flex-col gap-4">
              <div className="flex items-center">
                <div className="relative flex items-center">
                  <Search className="absolute left-2 h-6 w-6 text-gray-500" />
                  <input
                    type="text"
                    value={searchValue}
                    onChange={handleSearch}
                    placeholder={localize('com_nav_plugin_search')}
                    className="
                    text-token-text-primary flex rounded-md border border-border-heavy bg-surface-tertiary py-2 pl-10 pr-2"
                  />
                </div>
              </div>
              <div
                ref={gridRef}
                className="grid grid-cols-1 grid-rows-2 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
                style={{ minHeight: '410px' }}
              >
                {filteredPlugins &&
                  filteredPlugins
                    .slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
                    .map((plugin, index) => (
                      <PluginStoreItem
                        key={index}
                        plugin={plugin}
                        isInstalled={userPlugins.includes(plugin.pluginKey)}
                        onInstall={() => onPluginInstall(plugin.pluginKey)}
                        onUninstall={() => uninstallPlugin(plugin.pluginKey)}
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
              {/* API not yet implemented: */}
              {/* <div className="flex flex-col items-center gap-2 sm:flex-row">
                <PluginStoreLinkButton
                  label="Install an unverified plugin"
                  onClick={onInstallUnverifiedPlugin}
                />
                <div className="hidden h-4 border-l border-black/30 dark:border-white/30 sm:block"></div>
                <PluginStoreLinkButton
                  label="Develop your own plugin"
                  onClick={onDevelopPluginClick}
                />
                <div className="hidden h-4 border-l border-black/30 dark:border-white/30 sm:block"></div>
                <PluginStoreLinkButton label="About plugins" onClick={onAboutPluginsClick} />
              </div> */}
            </div>
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  );
}

export default PluginStoreDialog;
