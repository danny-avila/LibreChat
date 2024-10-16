import { useState, useRef } from 'react';
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
  const [activeTab, setActiveTab] = useState(SettingsTabValues.GENERAL);
  const tabRefs = useRef({});

  const handleKeyDown = (event: React.KeyboardEvent) => {
    const tabs = [
      SettingsTabValues.GENERAL,
      SettingsTabValues.CHAT,
      SettingsTabValues.BETA,
      SettingsTabValues.COMMANDS,
      SettingsTabValues.SPEECH,
      SettingsTabValues.DATA,
      SettingsTabValues.ACCOUNT,
    ];
    const currentIndex = tabs.indexOf(activeTab);

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setActiveTab(tabs[(currentIndex + 1) % tabs.length]);
        break;
      case 'ArrowUp':
        event.preventDefault();
        setActiveTab(tabs[(currentIndex - 1 + tabs.length) % tabs.length]);
        break;
      case 'Home':
        event.preventDefault();
        setActiveTab(tabs[0]);
        break;
      case 'End':
        event.preventDefault();
        setActiveTab(tabs[tabs.length - 1]);
        break;
    }
  };

  const handleTabChange = (value: string) => {
    setActiveTab(value as SettingsTabValues);
  };

  return (
    <Transition appear show={open}>
      <Dialog as="div" className="relative z-50" onClose={onOpenChange}>
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
                'min-h-[600px] overflow-hidden rounded-xl rounded-b-lg bg-background pb-6 shadow-2xl backdrop-blur-2xl animate-in sm:rounded-2xl md:min-h-[373px] md:w-[680px]',
              )}
            >
              <DialogTitle
                className="mb-1 flex items-center justify-between p-6 pb-5 text-left"
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
              <div className="max-h-[550px] overflow-auto px-6 md:max-h-[400px] md:min-h-[400px] md:w-[680px]">
                <Tabs.Root
                  value={activeTab}
                  onValueChange={handleTabChange}
                  className="flex flex-col gap-10 md:flex-row"
                  orientation="vertical"
                >
                  <Tabs.List
                    aria-label="Settings"
                    className={cn(
                      'min-w-auto max-w-auto relative -ml-[8px] flex flex-shrink-0 flex-col flex-nowrap overflow-auto sm:max-w-none',
                      isSmallScreen ? 'flex-row rounded-xl bg-surface-secondary' : '',
                    )}
                    onKeyDown={handleKeyDown}
                  >
                    {[
                      {
                        value: SettingsTabValues.GENERAL,
                        icon: <GearIcon />,
                        label: 'com_nav_setting_general',
                      },
                      {
                        value: SettingsTabValues.CHAT,
                        icon: <MessageSquare className="icon-sm" />,
                        label: 'com_nav_setting_chat',
                      },
                      {
                        value: SettingsTabValues.BETA,
                        icon: <ExperimentIcon />,
                        label: 'com_nav_setting_beta',
                      },
                      {
                        value: SettingsTabValues.COMMANDS,
                        icon: <Command className="icon-sm" />,
                        label: 'com_nav_commands',
                      },
                      {
                        value: SettingsTabValues.SPEECH,
                        icon: <SpeechIcon className="icon-sm" />,
                        label: 'com_nav_setting_speech',
                      },
                      {
                        value: SettingsTabValues.DATA,
                        icon: <DataIcon />,
                        label: 'com_nav_setting_data',
                      },
                      {
                        value: SettingsTabValues.ACCOUNT,
                        icon: <UserIcon />,
                        label: 'com_nav_setting_account',
                      },
                    ].map(({ value, icon, label }) => (
                      <Tabs.Trigger
                        key={value}
                        className={cn(
                          'group relative z-10 m-1 flex items-center justify-start gap-2 px-2 py-1.5 transition-all duration-200 ease-in-out',
                          isSmallScreen
                            ? 'flex-1 justify-center text-nowrap rounded-xl p-1 px-3 text-sm text-text-secondary radix-state-active:bg-surface-hover radix-state-active:text-text-primary'
                            : 'rounded-md bg-transparent text-text-primary radix-state-active:bg-surface-tertiary',
                        )}
                        value={value}
                        ref={(el) => (tabRefs.current[value] = el)}
                      >
                        {icon}
                        {localize(label)}
                      </Tabs.Trigger>
                    ))}
                  </Tabs.List>
                  <div className="overflow-auto sm:w-full sm:max-w-none md:pr-0.5 md:pt-0.5">
                    <Tabs.Content value={SettingsTabValues.GENERAL}>
                      <General />
                    </Tabs.Content>
                    <Tabs.Content value={SettingsTabValues.CHAT}>
                      <Chat />
                    </Tabs.Content>
                    <Tabs.Content value={SettingsTabValues.BETA}>
                      <Beta />
                    </Tabs.Content>
                    <Tabs.Content value={SettingsTabValues.COMMANDS}>
                      <Commands />
                    </Tabs.Content>
                    <Tabs.Content value={SettingsTabValues.SPEECH}>
                      <Speech />
                    </Tabs.Content>
                    <Tabs.Content value={SettingsTabValues.DATA}>
                      <Data />
                    </Tabs.Content>
                    <Tabs.Content value={SettingsTabValues.ACCOUNT}>
                      <Account />
                    </Tabs.Content>
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
