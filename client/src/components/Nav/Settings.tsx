import React from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import { Dialog, DialogPanel, DialogTitle, Transition, TransitionChild } from '@headlessui/react';
import type { TDialogProps } from '~/common';
import { Account, Location } from './SettingsTabs';
import SubscriptionSection from './SettingsTabs/Account/SubscriptionSection';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

type SettingsTab = 'account' | 'subscription' | 'location';
type SettingsProps = TDialogProps & {
  initialTab?: SettingsTab;
};

export default function Settings({ open, onOpenChange, initialTab = 'account' }: SettingsProps) {
  const localize = useLocalize();
  const [activeTab, setActiveTab] = React.useState<SettingsTab>(initialTab);

  React.useEffect(() => {
    if (open) {
      setActiveTab(initialTab);
    }
  }, [initialTab, open]);

  return (
    <Transition appear show={open}>
      {/* z-[80] keeps the dialog above the mobile-nav panel (z-[64]) and its
          backdrop (z-50). Without this, the dialog portals to <body> but the
          sidebar panel sits on top, leaving the modal unclickable. */}
      <Dialog as="div" className="relative z-[80]" onClose={onOpenChange}>
        <TransitionChild
          enter="ease-out duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black opacity-50 dark:opacity-80" aria-hidden="true" />
        </TransitionChild>

        <TransitionChild
          enter="ease-out duration-200"
          enterFrom="opacity-0 scale-95"
          enterTo="opacity-100 scale-100"
          leave="ease-in duration-100"
          leaveFrom="opacity-100 scale-100"
          leaveTo="opacity-0 scale-95"
        >
          <div className={cn('fixed inset-0 flex w-screen items-center justify-center p-4')}>
            <DialogPanel
              className={cn(
                'min-h-[600px] w-full overflow-hidden rounded-xl rounded-b-lg border border-border-light bg-surface-dialog pb-6 shadow-2xl backdrop-blur-2xl animate-in sm:rounded-2xl md:min-h-[373px] md:w-[680px]',
              )}
            >
              <DialogTitle
                className="mb-1 flex items-center justify-between border-b border-border-light px-6 py-5 text-left"
                as="div"
              >
                <div className="flex items-center gap-3">
                  <span className="h-6 w-[3px] rounded-sm bg-[var(--signal-amber)]" />
                  <h2 className="text-xl font-semibold leading-6 tracking-tight text-text-primary">
                    {localize('com_nav_settings')}
                  </h2>
                </div>
                <button
                  type="button"
                  className="rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-border-xheavy focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-surface-primary dark:focus:ring-offset-surface-primary"
                  onClick={() => onOpenChange(false)}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-5 w-5 text-text-primary"
                  >
                    <line x1="18" x2="6" y1="6" y2="18"></line>
                    <line x1="6" x2="18" y1="6" y2="18"></line>
                  </svg>
                  <span className="sr-only">{localize('com_ui_close_settings')}</span>
                </button>
              </DialogTitle>
              <Tabs.Root
                value={activeTab}
                onValueChange={(value) => setActiveTab(value as SettingsTab)}
                className="flex flex-col"
              >
                <div className="px-6 pt-5">
                  <Tabs.List className="mb-2 flex gap-1 border-b border-border-light">
                    {(
                      [
                        { value: 'account', label: 'Account' },
                        { value: 'subscription', label: 'Subscription' },
                        { value: 'location', label: 'Location' },
                      ] as const
                    ).map((tab) => (
                      <Tabs.Trigger
                        key={tab.value}
                        value={tab.value}
                        className={cn(
                          'relative -mb-px px-3 pb-3 pt-1 text-xs font-bold uppercase tracking-[0.18em] transition-colors',
                          activeTab === tab.value
                            ? 'text-text-primary after:absolute after:inset-x-3 after:bottom-0 after:h-[2px] after:rounded-sm after:bg-[var(--signal-amber)]'
                            : 'text-[var(--slate-500)] hover:text-text-primary',
                        )}
                      >
                        {tab.label}
                      </Tabs.Trigger>
                    ))}
                  </Tabs.List>
                </div>
                <div className="max-h-[550px] w-full overflow-auto px-6 md:max-h-[400px] md:min-h-[400px] md:w-[680px]">
                  <Tabs.Content value="account" tabIndex={-1}>
                    <Account showSubscription={false} />
                  </Tabs.Content>
                  <Tabs.Content value="subscription" tabIndex={-1}>
                    <div className="p-1">
                      <SubscriptionSection />
                    </div>
                  </Tabs.Content>
                  <Tabs.Content value="location" tabIndex={-1}>
                    <div className="p-1">
                      <Location />
                    </div>
                  </Tabs.Content>
                </div>
              </Tabs.Root>
            </DialogPanel>
          </div>
        </TransitionChild>
      </Dialog>
    </Transition>
  );
}
