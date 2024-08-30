import { Dialog, DialogContent } from '~/components/ui';
import * as Tabs from '@radix-ui/react-tabs';
import { cn } from '~/utils/';
import { useMediaQuery } from '~/hooks';
import { UserIcon } from '~/components/svg';
import { Account } from './ManagementTabs';

export default function Management({ open, onOpenChange }) {
  const isSmallScreen = useMediaQuery('(max-width: 767px)');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn('w-10/12 overflow-x-auto shadow-2xl dark:bg-gray-700 dark:text-white')}
      >
        <div className="overflow-x-auto p-0 sm:p-6 sm:pt-4">
          <Tabs.Root
            defaultValue='account'
            className="gap-10 md:flex-row"
          >
            <Tabs.List
              aria-label="Management"
              role="tablist"
              className={cn(
                'min-w-auto max-w-auto -ml-[8px] flex flex-shrink-0  flex-nowrap overflow-auto sm:max-w-none',
                isSmallScreen ? 'flex-row rounded-lg bg-surface-secondary' : '',
              )}
              style={{ outline: 'none' }}
            >
              <Tabs.Trigger
                tabIndex={0}
                className={cn(
                  'group m-1 flex items-center justify-start gap-2 rounded-md px-2 py-1.5 text-sm text-text-primary transition-all duration-200 ease-in-out radix-state-active:bg-surface-tertiary radix-state-active:text-text-primary dark:radix-state-active:bg-surface-active',
                  isSmallScreen
                    ? 'flex-1 items-center justify-center text-nowrap p-1 px-3 text-sm text-text-secondary'
                    : 'bg-surface-tertiary-alt',
                )}
                value='account'
                style={{ userSelect: 'none' }}
              >
                <UserIcon />
                用户
              </Tabs.Trigger>
            </Tabs.List>
            <div className="overflow-auto sm:w-full sm:max-w-none md:pr-0.5 md:pt-0.5">
              <Tabs.Content value="account">
                <Account />
              </Tabs.Content>
            </div>
          </Tabs.Root>
          <div className="mt-5 sm:mt-4" />
        </div>
      </DialogContent>
    </Dialog>
  );
}
