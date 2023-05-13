import { useState, useEffect, useCallback } from 'react';
import { Dialog } from '@headlessui/react';
import { X } from 'lucide-react';
import { PluginStoreItem, PluginPagination, PluginStoreLinkButton } from '.';
import { useAvailablePluginsQuery } from '~/data-provider';

type TPluginStoreDialogProps = {
  isOpen: boolean,
  setIsOpen: (open: boolean) => void
};

function PluginStoreDialog({ isOpen, setIsOpen }: TPluginStoreDialogProps) {
  const { data, isLoading } = useAvailablePluginsQuery();
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage, setItemsPerPage] = useState<number>(1);
  const [maxPage, setMaxPage] = useState<number>(1);

  const onPluginInstall = (name: string) => {
    console.log(`Installing ${name}`);
  };

  const onPluginUninstall = (name: string) => {
    console.log(`Uninstalling ${name}`);
  };

  const onInstallUnverifiedPlugin = () => {
    console.log('Installing unverified plugin');
  };

  const onDevelopPluginClick = () => {
    console.log('Developing plugin');
  };

  const onAboutPluginsClick = () => {
    console.log('About plugins');
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

  const gridRef = useCallback(node => {
    if (node !== null) {
      if (itemsPerPage === 1) {
        calculateColumns(node);
      }
      const resizeObserver = new ResizeObserver(() => calculateColumns(node));
      resizeObserver.observe(node);
    }
  }, []);
  
  useEffect(() => {
    if (data) {
      setMaxPage(Math.ceil(data.length / itemsPerPage));
    }
  }, [data, itemsPerPage]);
  
  const handleChangePage = (page: number) => {
    setCurrentPage(page);
  };
  
  console.log('itemsPerPage', itemsPerPage)
  return (
    <Dialog
      open={isOpen}
      onClose={() => setIsOpen(false)}
      className="relative z-50"
    >
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
          <div className="p-4 sm:p-6 sm:pt-4">
            <div className="mt-4 flex flex-col gap-4">
              <div
                ref={gridRef}
                className="grid grid-cols-1 grid-rows-2 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
              >
                {isLoading && <div>Loading...</div>}
                {data &&
                  data
                    .slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
                    .map((plugin, index) => (
                      <PluginStoreItem
                        key={index}
                        title={plugin.title}
                        description={plugin.description}
                        imageSource={plugin.imageSource}
                        onInstall={() => onPluginInstall(plugin.name)}
                        onUninstall={() => onPluginUninstall(plugin.name)}
                      />
                    ))}
              </div>
            </div>
            <div className="flex flex-col mt-2 items-center gap-2 sm:flex-row sm:justify-between">
              <div>
                <PluginPagination
                  currentPage={currentPage}
                  maxPage={maxPage}
                  onChangePage={handleChangePage}
                />
              </div>
              <div className="flex flex-col items-center gap-2 sm:flex-row">
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
              </div>
            </div>
          </div>
        </Dialog.Panel>
      </div>
    </Dialog>
  );
}

export default PluginStoreDialog;
