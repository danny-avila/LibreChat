import * as Tabs from '@radix-ui/react-tabs';
import type { TDialogProps } from '~/common';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '~/components/ui';
import { GearIcon, DataIcon, UserIcon } from '~/components/svg';
import { General, Data, Account } from './SettingsTabs';
import { useMediaQuery, useLocalize } from '~/hooks';
import { cn } from '~/utils';

export default function Settings({ open, onOpenChange }: TDialogProps) {
  const isSmallScreen = useMediaQuery('(max-width: 768px)');
  const localize = useLocalize();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn('shadow-2xl dark:bg-gray-900 dark:text-white md:min-h-[373px] md:w-[680px]')}
        style={{ borderRadius: '12px' }}
      >
        <DialogHeader>
          <DialogTitle className="text-lg font-medium leading-6 text-gray-900 dark:text-gray-200">
            {localize('com_nav_settings')}
          </DialogTitle>
        </DialogHeader>
        <div className="px-6">
          <Tabs.Root
            defaultValue="general"
            className="flex flex-col gap-10 md:flex-row"
            orientation="vertical"
          >
            <Tabs.List
              aria-label="Settings"
              role="tablist"
              aria-orientation="vertical"
              className={cn(
                'min-w-auto -ml-[8px] flex flex-shrink-0 flex-col',
                isSmallScreen ? 'flex-row rounded-lg bg-gray-100 p-1 dark:bg-gray-800/30' : '',
              )}
              style={{ outline: 'none' }}
            >
              <Tabs.Trigger
                className={cn(
                  'group my-1 flex items-center justify-start gap-2 rounded-md px-2 py-1.5 text-sm text-black radix-state-active:bg-gray-100 radix-state-active:text-black dark:text-white dark:radix-state-active:bg-gray-800',
                  isSmallScreen
                    ? 'flex-1 items-center justify-center text-sm dark:text-gray-500 dark:radix-state-active:text-white'
                    : '',
                )}
                value="general"
              >
                <GearIcon />
                {localize('com_nav_setting_general')}
              </Tabs.Trigger>
              <Tabs.Trigger
                className={cn(
                  'group my-1 flex items-center justify-start gap-2 rounded-md px-2 py-1.5 text-sm text-black radix-state-active:bg-gray-100 radix-state-active:text-black dark:text-white dark:radix-state-active:bg-gray-800',
                  isSmallScreen
                    ? 'flex-1 items-center justify-center text-sm dark:text-gray-500 dark:radix-state-active:text-white'
                    : '',
                )}
                value="data"
              >
                <DataIcon />
                {localize('com_nav_setting_data')}
              </Tabs.Trigger>
              <Tabs.Trigger
                className={cn(
                  'group my-1 flex items-center justify-start gap-2 rounded-md px-2 py-1.5 text-sm text-black radix-state-active:bg-gray-100 radix-state-active:text-black dark:text-white dark:radix-state-active:bg-gray-800',
                  isSmallScreen
                    ? 'flex-1 items-center justify-center text-sm dark:text-gray-500 dark:radix-state-active:text-white'
                    : '',
                )}
                value="account"
              >
                <UserIcon />
                {localize('com_nav_setting_account')}
              </Tabs.Trigger>
            </Tabs.List>
            <General />
            <Data />
            <Account />
          </Tabs.Root>
        </div>
      </DialogContent>
    </Dialog>
  );
}
