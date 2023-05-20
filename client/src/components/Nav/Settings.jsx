import GearIcon from '../svg/GearIcon';
import { Dialog } from '../ui/Dialog.tsx';
import * as Tabs from '@radix-ui/react-tabs';
import { DialogContent, DialogHeader, DialogTitle } from '../ui/Dialog.tsx';
import { useEffect, useState } from 'react';
import { cn } from '~/utils/';
import { useClearConversationsMutation } from '~/data-provider';
import store from '~/store';

export default function ClearConvos({ open, onOpenChange }) {
  const { newConversation } = store.useConversation();
  const { refreshConversations } = store.useConversations();
  const clearConvosMutation = useClearConversationsMutation();
  const [isMobile, setIsMobile] = useState(false);

  const clearConvos = () => {
    console.log('Clearing conversations...');
    clearConvosMutation.mutate();
  };

  // check if mobile dynamically and update
  useEffect(() => {
    const checkMobile = () => {
      if (window.innerWidth <= 768) {
        setIsMobile(true);
      } else {
        setIsMobile(false);
      }
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    if (clearConvosMutation.isSuccess) {
      newConversation();
      refreshConversations();
    }
  }, [clearConvosMutation.isSuccess]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn('shadow-2xl dark:bg-gray-900 dark:text-white')}>
        <DialogHeader>
          <DialogTitle className="text-gray-800 dark:text-white">Settings</DialogTitle>
        </DialogHeader>
        <div className="px-6">
          <Tabs.Root
            defaultValue="general"
            className="flex flex-col gap-6 md:flex-row"
            orientation="vertical"
          >
            <Tabs.List
              aria-label="Settings"
              role="tablist"
              aria-orientation="vertical"
              className={cn(
                '-ml-[8px] flex min-w-[180px] flex-shrink-0 flex-col',
                isMobile && 'flex-row rounded-lg bg-gray-100 p-1 dark:bg-gray-800/30'
              )}
              style={{ outline: 'none' }}
            >
              <Tabs.Trigger
                className={cn(
                  'radix-state-active:bg-gray-800 radix-state-active:text-white flex items-center justify-start gap-2 rounded-md px-2 py-1.5 text-sm',
                  isMobile &&
                    'dark:radix-state-active:text-white group flex-1 items-center justify-center text-sm dark:text-gray-500'
                )}
                value="general"
              >
                <GearIcon />
                General
              </Tabs.Trigger>
            </Tabs.List>

            <Tabs.Content value="general" role="tabpanel" className="w-full md:min-h-[300px]">
              <div className="flex flex-col gap-3 text-sm text-gray-600 dark:text-gray-300">
                <div className="border-b pb-3 last-of-type:border-b-0 dark:border-gray-700">
                  <div className="flex items-center justify-between">
                    <div>Theme</div>
                    <select className="w-24 rounded border border-black/10 bg-transparent text-sm dark:border-white/20">
                      <option value="system">System</option>
                      <option value="dark">Dark</option>
                      <option value="light">Light</option>
                    </select>
                  </div>
                </div>
                <div className="border-b pb-3 last-of-type:border-b-0 dark:border-gray-700">
                  <div className="flex items-center justify-between">
                    <div>Clear all chats</div>
                    <button className="btn relative bg-red-600  text-white hover:bg-red-800">
                      <div
                        className="flex w-full items-center justify-center gap-2"
                        onClick={clearConvos}
                      >
                        Clear
                      </div>
                    </button>
                  </div>
                </div>
              </div>
            </Tabs.Content>
          </Tabs.Root>
        </div>
      </DialogContent>
    </Dialog>
  );
}
