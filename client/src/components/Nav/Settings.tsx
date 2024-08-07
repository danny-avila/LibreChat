import * as Tabs from '@radix-ui/react-tabs';
import { MessageSquare, Command } from 'lucide-react';
import { SettingsTabValues } from 'librechat-data-provider';
import type { TDialogProps } from '~/common';
import { Dialog, DialogPanel, DialogTitle, Transition, TransitionChild } from '@headlessui/react';
import { GearIcon, DataIcon, SpeechIcon, UserIcon, ExperimentIcon } from '~/components/svg';
import { General, Chat, Speech, Beta, Commands, Data, Account } from './SettingsTabs';
import { useMediaQuery, useLocalize } from '~/hooks';
import { cn } from '~/utils';

export default function Settings({ open, onOpenChange }: TDialogProps) {
  const isSmallScreen = useMediaQuery('(max-width: 767px)');
  const localize = useLocalize();

  return (
    <Transition appear show={open}>
      <Dialog as="div" className="relative z-50 focus:outline-none" onClose={onOpenChange}>
        <TransitionChild
          enter="ease-out duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-100"
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
          <div
            className={cn(
              'fixed inset-0 flex w-screen items-center justify-center p-4',
              isSmallScreen ? '' : '',
            )}
          >
            <DialogPanel
              className={cn(
                'overflow-hidden rounded-xl rounded-b-lg bg-surface-tertiary-alt pb-6 shadow-2xl backdrop-blur-2xl animate-in sm:rounded-lg md:min-h-[373px] md:w-[680px]',
              )}
            >
              <DialogTitle
                className="mb-3 flex items-center justify-between border-b border-border-medium p-6 pb-5 text-left"
                as="div"
              >
                <h2 className="text-lg font-medium leading-6 text-text-primary">
                  {localize('com_nav_settings')}
                </h2>
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
                  <span className="sr-only">Close</span>
                </button>
              </DialogTitle>
              <div className="max-h-[373px] overflow-auto px-6 md:min-h-[373px] md:w-[680px]">
                <Tabs.Root
                  defaultValue={SettingsTabValues.GENERAL}
                  className="flex flex-col gap-10 md:flex-row"
                  orientation="horizontal"
                >
                  <Tabs.List
                    aria-label="Settings"
                    role="tablist"
                    aria-orientation="horizontal"
                    className={cn(
                      'min-w-auto max-w-auto -ml-[8px] flex flex-shrink-0 flex-col flex-nowrap overflow-auto sm:max-w-none',
                      isSmallScreen ? 'flex-row rounded-lg bg-surface-secondary' : '',
                    )}
                    style={{ outline: 'none' }}
                  >
                    <Tabs.Trigger
                      tabIndex={0}
                      className={cn(
                        'group m-1 flex items-center justify-start gap-2 rounded-md px-2 py-1.5 text-sm text-text-primary transition-all duration-200 ease-in-out radix-state-active:bg-surface-tertiary radix-state-active:text-text-primary dark:radix-state-active:bg-surface-primary',
                        isSmallScreen
                          ? 'flex-1 items-center justify-center text-nowrap p-1 px-3 text-sm text-text-secondary'
                          : 'bg-surface-tertiary-alt',
                      )}
                      value={SettingsTabValues.GENERAL}
                      style={{ userSelect: 'none' }}
                    >
                      <GearIcon />
                      {localize('com_nav_setting_general')}
                    </Tabs.Trigger>
                    <Tabs.Trigger
                      tabIndex={0}
                      className={cn(
                        'group m-1 flex items-center justify-start gap-2 rounded-md px-2 py-1.5 text-sm text-text-primary transition-all duration-200 ease-in-out radix-state-active:bg-surface-tertiary radix-state-active:text-text-primary dark:radix-state-active:bg-surface-primary',
                        isSmallScreen
                          ? 'flex-1 items-center justify-center text-nowrap p-1 px-3 text-sm text-text-secondary'
                          : 'bg-surface-tertiary-alt',
                      )}
                      value={SettingsTabValues.CHAT}
                      style={{ userSelect: 'none' }}
                    >
                      <MessageSquare className="icon-sm" />
                      {localize('com_nav_setting_chat')}
                    </Tabs.Trigger>
                    <Tabs.Trigger
                      tabIndex={0}
                      className={cn(
                        'group m-1 flex items-center justify-start gap-2 rounded-md px-2 py-1.5 text-sm text-text-primary transition-all duration-200 ease-in-out radix-state-active:bg-surface-tertiary radix-state-active:text-text-primary dark:radix-state-active:bg-surface-primary',
                        isSmallScreen
                          ? 'flex-1 items-center justify-center text-nowrap p-1 px-3 text-sm text-text-secondary'
                          : 'bg-surface-tertiary-alt',
                      )}
                      value={SettingsTabValues.BETA}
                      style={{ userSelect: 'none' }}
                    >
                      <ExperimentIcon />
                      {localize('com_nav_setting_beta')}
                    </Tabs.Trigger>
                    <Tabs.Trigger
                      tabIndex={0}
                      className={cn(
                        'group m-1 flex items-center justify-start gap-2 rounded-md px-2 py-1.5 text-sm text-text-primary transition-all duration-200 ease-in-out radix-state-active:bg-surface-tertiary radix-state-active:text-text-primary dark:radix-state-active:bg-surface-primary',
                        isSmallScreen
                          ? 'flex-1 items-center justify-center text-nowrap text-sm text-text-secondary'
                          : 'bg-surface-tertiary-alt',
                      )}
                      value={SettingsTabValues.COMMANDS}
                      style={{ userSelect: 'none' }}
                    >
                      <Command className="icon-sm" />
                      {localize('com_nav_commands')}
                    </Tabs.Trigger>
                    <Tabs.Trigger
                      tabIndex={0}
                      className={cn(
                        'group m-1 flex items-center justify-start gap-2 rounded-md px-2 py-1.5 text-sm text-text-primary transition-all duration-200 ease-in-out radix-state-active:bg-surface-tertiary radix-state-active:text-text-primary dark:radix-state-active:bg-surface-primary',
                        isSmallScreen
                          ? 'flex-1 items-center justify-center text-nowrap p-1 px-3 text-sm text-text-secondary'
                          : 'bg-surface-tertiary-alt',
                      )}
                      value={SettingsTabValues.SPEECH}
                      style={{ userSelect: 'none' }}
                    >
                      <SpeechIcon className="icon-sm" />
                      {localize('com_nav_setting_speech')}
                    </Tabs.Trigger>
                    <Tabs.Trigger
                      tabIndex={0}
                      className={cn(
                        'group m-1 flex items-center justify-start gap-2 rounded-md px-2 py-1.5 text-sm text-text-primary transition-all duration-200 ease-in-out radix-state-active:bg-surface-tertiary radix-state-active:text-text-primary dark:radix-state-active:bg-surface-primary',
                        isSmallScreen
                          ? 'flex-1 items-center justify-center text-nowrap p-1 px-3 text-sm text-text-secondary'
                          : 'bg-surface-tertiary-alt',
                      )}
                      value={SettingsTabValues.DATA}
                      style={{ userSelect: 'none' }}
                    >
                      <DataIcon />
                      {localize('com_nav_setting_data')}
                    </Tabs.Trigger>
                    <Tabs.Trigger
                      tabIndex={0}
                      className={cn(
                        'group m-1 flex items-center justify-start gap-2 rounded-md px-2 py-1.5 text-sm text-text-primary transition-all duration-200 ease-in-out radix-state-active:bg-surface-tertiary radix-state-active:text-text-primary dark:radix-state-active:bg-surface-primary',
                        isSmallScreen
                          ? 'flex-1 items-center justify-center text-nowrap p-1 px-3 text-sm text-text-secondary'
                          : 'bg-surface-tertiary-alt',
                      )}
                      value={SettingsTabValues.ACCOUNT}
                      style={{ userSelect: 'none' }}
                    >
                      <UserIcon />
                      {localize('com_nav_setting_account')}
                    </Tabs.Trigger>
                  </Tabs.List>
                  <div className="max-h-[373px] overflow-auto sm:w-full sm:max-w-none md:pr-0.5 md:pt-0.5">
                    <General />
                    <Chat />
                    <Beta />
                    <Commands />
                    <Speech />
                    <Data />
                    <Account />
                  </div>
                </Tabs.Root>
              </div>
            </DialogPanel>
          </div>
        </TransitionChild>
      </Dialog>
    </Transition>
  );
}
