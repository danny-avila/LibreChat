import { useState, useEffect, useCallback } from 'react';
import { Dialog } from '@headlessui/react';
import { X } from 'lucide-react';
import { PluginStoreItem, PluginPagination, PluginStoreLinkButton, PluginAuthForm } from '.';
import {
  useAvailablePluginsQuery,
  useUpdateUserPluginsMutation,
  TUpdateUserPlugins,
  TPlugin
} from '~/data-provider';
import { useAuthContext } from '~/hooks/AuthContext';

type TPluginStoreDialogProps = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
};

type TPluginAction = {
  pluginKey: string;
  action: 'install' | 'uninstall';
  auth?: unknown;
};

function PluginStoreDialog({ isOpen, setIsOpen }: TPluginStoreDialogProps) {
  const { data: availablePlugins } = useAvailablePluginsQuery();
  const { user } = useAuthContext();
  const updateUserPlugins = useUpdateUserPluginsMutation<TUpdateUserPlugins>();
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage, setItemsPerPage] = useState<number>(1);
  const [maxPage, setMaxPage] = useState<number>(1);
  const [userPlugins, setUserPlugins] = useState<string[]>([]);
  const [selectedPlugin, setSelectedPlugin] = useState<TPlugin | undefined>(undefined);
  const [showPluginAuthForm, setShowPluginAuthForm] = useState<boolean>(false);
  const [error, setError] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');

  const handleInstallError = (error:any) => {
    setError(true);
    if (error.response?.data?.message) {
      setErrorMessage(error.response?.data?.message);
    }
    setTimeout(() => {
      setError(false);
      setErrorMessage('');
    }, 5000);
  };

  const handleInstall = (pluginAction: TPluginAction) => {
    updateUserPlugins.mutate(pluginAction, {
      onError: (error) => {
        handleInstallError(error);
      }
    });
    setShowPluginAuthForm(false);
  };


  const onPluginUninstall = (plugin: string) => {
    updateUserPlugins.mutate({ pluginKey: plugin, action: 'uninstall', auth: null }, {
      onError: (error) => {
        handleInstallError(error);
      }
    });
  };

  const onPluginInstall = (pluginKey: string) => {
    const getAvailablePluginFromKey = availablePlugins?.find((p) => p.pluginKey === pluginKey);
    setSelectedPlugin(getAvailablePluginFromKey);

    if (getAvailablePluginFromKey.authConfig.length > 0) {
      setShowPluginAuthForm(true);
    } else {
      handleInstall({ pluginKey, action: 'install', auth: null });
    }
  };

  const calculateColumns = (node) => {
    const width = node.offsetWidth;
    let columns;
    if (width < 640) {
      columns = 2;
    } else if (width < 1024) {
      columns = 3;
    } else {
      columns = 4;
    }
    setItemsPerPage(columns * 2); // 2 rows
  };

  const gridRef = useCallback(
    (node) => {
      if (node !== null) {
        if (itemsPerPage === 1) {
          calculateColumns(node);
        }
        const resizeObserver = new ResizeObserver(() => calculateColumns(node));
        resizeObserver.observe(node);
      }
    },
    [itemsPerPage]
  );

  useEffect(() => {
    if (user) {
      if (user.plugins) {
        setUserPlugins(user.plugins);
      }
    }
    if (availablePlugins) {
      setMaxPage(Math.ceil(availablePlugins.length / itemsPerPage));
    }
  }, [availablePlugins, itemsPerPage, user]);

  const handleChangePage = (page: number) => {
    setCurrentPage(page);
  };

  return (
    <Dialog open={isOpen} onClose={() => setIsOpen(false)} className="relative z-50">
      {/* The backdrop, rendered as a fixed sibling to the panel container */}
      <div className="fixed inset-0 bg-gray-500/90 transition-opacity dark:bg-gray-800/90" />

      {/* Full-screen container to center the panel */}
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <Dialog.Panel className="relative w-full transform overflow-hidden rounded-lg bg-white text-left shadow-xl transition-all dark:bg-gray-900 sm:mx-7 sm:my-8 sm:max-w-2xl lg:max-w-5xl xl:max-w-7xl">
          <div className="flex items-center justify-between border-b-[1px] border-black/10 px-4 pb-4 pt-5 dark:border-white/10 sm:p-6">
            <div className="flex items-center">
              <div className="text-center sm:text-left">
                <Dialog.Title className="text-lg font-medium leading-6 text-gray-900 dark:text-gray-200">
                  Plugin store
                </Dialog.Title>
              </div>
            </div>
            <div>
              <div className="sm:mt-0">
                <button
                  onClick={() => setIsOpen(false)}
                  className="inline-block text-gray-500 hover:text-gray-100"
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
              There was an error attempting to authenticate this plugin. Please try again.{' '}
              {errorMessage}
            </div>
          )}
          {showPluginAuthForm && (
            <div className="p-4 sm:p-6 sm:pt-4">
              <PluginAuthForm
                plugin={selectedPlugin}
                onSubmit={(installActionData: TPluginAction) => handleInstall(installActionData)}
              />
            </div>
          )}
          <div className="p-4 sm:p-6 sm:pt-4">
            <div className="mt-4 flex flex-col gap-4">
              <div
                ref={gridRef}
                className="grid grid-cols-1 grid-rows-2 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
              >
                {availablePlugins &&
                  availablePlugins
                    .slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
                    .map((plugin, index) => (
                      <PluginStoreItem
                        key={index}
                        plugin={plugin}
                        isInstalled={userPlugins.includes(plugin.pluginKey)}
                        onInstall={() => onPluginInstall(plugin.pluginKey)}
                        onUninstall={() => onPluginUninstall(plugin.pluginKey)}
                      />
                    ))}
              </div>
            </div>
            <div className="mt-2 flex flex-col items-center gap-2 sm:flex-row sm:justify-between">
              <div>
                <PluginPagination
                  currentPage={currentPage}
                  maxPage={maxPage}
                  onChangePage={handleChangePage}
                />
              </div>
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
        </Dialog.Panel>
      </div>
    </Dialog>
  );
}

export default PluginStoreDialog;
