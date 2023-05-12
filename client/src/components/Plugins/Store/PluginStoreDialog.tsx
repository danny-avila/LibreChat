import { useState, useEffect } from 'react';
// import { Dialog, DialogContent } from '~/components';
// import { PluginStore } from './PluginStore';
import { Dialog } from '@headlessui/react';
import { X } from 'lucide-react';
import { PluginStoreItem } from '.';
import { useAvailablePluginsQuery } from '~/data-provider';

type TPluginStoreDialogProps = {
  isOpen: boolean,
  setIsOpen: (open: boolean) => void
};

function PluginStoreDialog({ isOpen, setIsOpen }: TPluginStoreDialogProps) {
  
  const { data, isLoading } = useAvailablePluginsQuery();

  useEffect(() => {
    if (data) {
      console.log(data);
    }
  }, [data]);

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
        <Dialog.Panel className="relative w-full transform overflow-hidden rounded-lg bg-white text-left shadow-xl transition-all dark:bg-gray-900 sm:mx-7 sm:my-8 sm:max-w-lg lg:max-w-5xl xl:max-w-7xl">
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
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:grid-rows-2 lg:grid-cols-3 xl:grid-cols-4">
                {/* <PluginStoreItem /> */}
                <div className="flex flex-col gap-4 rounded border border-black/10 bg-white p-6 dark:border-white/20 dark:bg-gray-900">
                  <div className="flex gap-4">
                    <div className="h-[70px] w-[70px] shrink-0">
                      <div className="relative h-full w-full">
                        <img
                          src="https://showme.redstarplugin.com/logo.svg"
                          alt="Show Me logo"
                          className="h-full w-full rounded-[5px] bg-white"
                        />
                        <div className="absolute inset-0 rounded-[5px] ring-1 ring-inset ring-black/10"></div>
                      </div>
                    </div>
                    <div className="flex min-w-0 flex-col items-start justify-between">
                      <div className="line-clamp-1 max-w-full text-lg leading-5 text-white">Show Me</div>
                      <button className="btn btn-primary relative">
                        <div className="flex w-full items-center justify-center gap-2">
                          Install
                          <svg
                            stroke="currentColor"
                            fill="none"
                            stroke-width="2"
                            viewBox="0 0 24 24"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            className="h-4 w-4"
                            height="1em"
                            width="1em"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <polyline points="8 17 12 21 16 17"></polyline>
                            <line
                              x1="12"
                              y1="12"
                              x2="12"
                              y2="21"
                            ></line>
                            <path d="M20.88 18.09A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.29"></path>
                          </svg>
                        </div>
                      </button>
                    </div>
                  </div>
                  <div className="line-clamp-3 h-[60px] text-sm text-black/70 dark:text-white/70">
                    Create and edit diagrams directly in chat.
                  </div>
                </div>
              </div>
            </div>
            <PluginStoreFooter />
          </div>
        </Dialog.Panel>
      </div>
    </Dialog>
  );
}

function PluginStoreFooter() {
  return (
    <div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-between">
      <div>
        <div className="flex gap-2 text-sm text-black/60 dark:text-white/70">
          <div
            role="button"
            className="flex cursor-default items-center text-sm text-black/70 opacity-50 dark:text-white/70"
          >
            <svg
              stroke="currentColor"
              fill="none"
              stroke-width="2"
              viewBox="0 0 24 24"
              stroke-linecap="round"
              stroke-linejoin="round"
              className="h-4 w-4"
              height="1em"
              width="1em"
              xmlns="http://www.w3.org/2000/svg"
            >
              <polyline points="15 18 9 12 15 6"></polyline>
            </svg>
            Prev
          </div>
          <div
            role="button"
            className="flex h-5 w-5 items-center justify-center text-sm text-blue-600 hover:text-blue-600 dark:text-blue-600 dark:hover:text-blue-600"
          >
            1
          </div>
          <div
            role="button"
            className="flex h-5 w-5 items-center justify-center text-sm text-black/70 hover:text-black/50 dark:text-white/70 dark:hover:text-white/50"
          >
            2
          </div>
          <div
            role="button"
            className="flex items-center text-sm text-black/70 hover:text-black/50 dark:text-white/70 dark:hover:text-white/50"
          >
            Next
            <svg
              stroke="currentColor"
              fill="none"
              stroke-width="2"
              viewBox="0 0 24 24"
              stroke-linecap="round"
              stroke-linejoin="round"
              className="h-4 w-4"
              height="1em"
              width="1em"
              xmlns="http://www.w3.org/2000/svg"
            >
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
          </div>
        </div>
      </div>
      <div className="flex flex-col items-center gap-2 sm:flex-row">
        <div
          role="button"
          className="text-sm text-black/70 hover:text-black/50 dark:text-white/70 dark:hover:text-white/50"
        >
          Install an unverified plugin
        </div>
        <div className="hidden h-4 border-l border-black/30 dark:border-white/30 sm:block"></div>
        <div
          role="button"
          className="text-sm text-black/70 hover:text-black/50 dark:text-white/70 dark:hover:text-white/50"
        >
          Develop your own plugin
        </div>
        <div className="hidden h-4 border-l border-black/30 dark:border-white/30 sm:block"></div>
        <div
          role="button"
          className="text-sm text-black/70 hover:text-black/50 dark:text-white/70 dark:hover:text-white/50"
        >
          About plugins
        </div>
      </div>
    </div>
  );
}

export default PluginStoreDialog;
