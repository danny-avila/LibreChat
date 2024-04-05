/* eslint-disable indent */
import * as Tabs from '@radix-ui/react-tabs';
import { SettingsTabValues } from 'librechat-data-provider';
import type { TDialogProps } from '~/common';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '~/components/ui';
import { GearIcon, DataIcon, UserIcon, ExperimentIcon, ChartBarIcon } from '~/components/svg';
import { General, Beta, Data, Account } from './SettingsTabs';
import { useMediaQuery, useLocalize } from '~/hooks';
import { cn } from '~/utils';
import Credits from './SettingsTabs/Credits/Credits';
import SettingsTab from './SettingsTab';
import { useRecoilValue } from 'recoil';
import store from '~/store';
import { useSearchParams } from 'react-router-dom';
import isEmpty from 'is-empty';
import { isPast } from 'date-fns';

export default function Settings({ open, onOpenChange }: TDialogProps) {
  const user = useRecoilValue(store.user);
  const isSmallScreen = useMediaQuery('(max-width: 767px)');
  const localize = useLocalize();
  const [searchParams] = useSearchParams();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          'shadow-2xl dark:bg-gray-800 dark:text-white md:min-h-[373px] md:w-[680px]',
          isSmallScreen ? 'top-20 -translate-y-0' : '',
        )}
      >
        <DialogHeader>
          <DialogTitle className="text-lg font-medium leading-6 text-gray-800 dark:text-gray-200">
            {localize('com_nav_settings')}
          </DialogTitle>
        </DialogHeader>
        <div className="w-full overflow-auto px-6">
          <Tabs.Root
            defaultValue={
              searchParams.get('tab') !== null
                ? SettingsTabValues[(searchParams.get('tab') as string).toUpperCase()]
                : SettingsTabValues.GENERAL
            }
            onValueChange={(e) => {
              console.log(e);
            }}
            className="flex flex-col gap-10 md:flex-row"
            orientation="vertical"
          >
            <Tabs.List
              aria-label="Settings"
              role="tablist"
              aria-orientation="vertical"
              className={cn(
                'min-w-auto -ml-[8px] flex flex-shrink-0 flex-col',
                isSmallScreen ? 'flex-row rounded-lg bg-gray-200 p-1 dark:bg-gray-800/30' : '',
              )}
              style={{ outline: 'none' }}
            >
              <SettingsTab value={SettingsTabValues.GENERAL}>
                <GearIcon />
                {localize('com_nav_setting_general')}
              </SettingsTab>
              <SettingsTab value={SettingsTabValues.BETA}>
                <ExperimentIcon />
                {localize('com_nav_setting_beta')}
              </SettingsTab>
              <SettingsTab value={SettingsTabValues.DATA}>
                <DataIcon />
                {localize('com_nav_setting_data')}
              </SettingsTab>
              <SettingsTab value={SettingsTabValues.ACCOUNT}>
                <UserIcon />
                {localize('com_nav_setting_account')}
              </SettingsTab>
              {(user?.subscription.active ||
                (!isEmpty(user?.subscription.renewalDate) &&
                  !isPast(user?.subscription.renewalDate as Date))) && (
                <SettingsTab value={SettingsTabValues.CREDITS}>
                  <ChartBarIcon />
                  {localize('com_nav_setting_credits')}
                </SettingsTab>
              )}
            </Tabs.List>
            <General />
            <Beta />
            <Data />
            <Account />
            <Credits />
          </Tabs.Root>
        </div>
      </DialogContent>
    </Dialog>
  );
}
