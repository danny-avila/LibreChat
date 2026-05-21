import { useState, memo, useRef } from 'react';
import * as Menu from '@ariakit/react/menu';
import { FileText, LogOut } from 'lucide-react';
import {
  LinkIcon,
  GearIcon,
  DropdownMenuSeparator,
  Avatar,
  TooltipAnchor,
} from '@librechat/client';
import { getRefillEligibilityDate } from 'librechat-data-provider';
import type { TBalanceResponse } from 'librechat-data-provider';
import { MyFilesModal } from '~/components/Chat/Input/Files/MyFilesModal';
import { useGetStartupConfig, useGetUserBalance } from '~/data-provider';
import { useAuthContext } from '~/hooks/AuthContext';
import { useLocalize } from '~/hooks';
import Settings from './Settings';

const JUST_REFILLED_WINDOW_MS = 24 * 60 * 60 * 1000;

function formatRefillAmount(amount: number): string {
  const sign = amount >= 0 ? '+' : '';
  return `${sign}${new Intl.NumberFormat().format(Math.round(amount))}`;
}

function formatTimeUntil(target: Date): string {
  const diffMs = target.getTime() - Date.now();
  if (diffMs <= 0) {
    return '';
  }
  const minutes = Math.round(diffMs / 60000);
  const hours = Math.round(diffMs / (60 * 60 * 1000));
  const days = Math.round(diffMs / (24 * 60 * 60 * 1000));
  if (days >= 1) {
    return days === 1 ? '1 day' : `${days} days`;
  }
  if (hours >= 1) {
    return hours === 1 ? '1 hour' : `${hours} hours`;
  }
  return minutes <= 1 ? '1 minute' : `${minutes} minutes`;
}

function BalanceMenuItem({ data }: { data: TBalanceResponse }) {
  const localize = useLocalize();
  const {
    tokenCredits,
    autoRefillEnabled,
    refillAmount,
    lastRefill,
    refillIntervalValue,
    refillIntervalUnit,
  } = data;

  const formattedBalance = new Intl.NumberFormat().format(Math.round(tokenCredits));

  const lastRefillDate = lastRefill ? new Date(lastRefill) : null;
  const validLastRefill =
    lastRefillDate && !isNaN(lastRefillDate.getTime()) ? lastRefillDate : null;
  const justRefilled =
    autoRefillEnabled === true &&
    typeof refillAmount === 'number' &&
    refillAmount > 0 &&
    validLastRefill !== null &&
    Date.now() - validLastRefill.getTime() < JUST_REFILLED_WINDOW_MS;

  const eligibilityDate =
    autoRefillEnabled === true &&
    validLastRefill !== null &&
    typeof refillIntervalValue === 'number' &&
    refillIntervalUnit !== undefined
      ? getRefillEligibilityDate(validLastRefill, refillIntervalValue, refillIntervalUnit)
      : null;
  const nextRefillLabel =
    !justRefilled && eligibilityDate !== null && eligibilityDate.getTime() > Date.now()
      ? localize('com_nav_balance_next_refill_in', { 0: formatTimeUntil(eligibilityDate) })
      : null;

  return (
    <div className="text-token-text-secondary ml-3 mr-2 py-2 text-sm" role="note">
      <div>
        {localize('com_nav_balance')}: {formattedBalance}
      </div>
      {justRefilled && typeof refillAmount === 'number' && validLastRefill !== null && (
        <TooltipAnchor
          side="right"
          description={localize('com_nav_balance_just_refilled_info', {
            0: validLastRefill.toLocaleString(),
          })}
          aria-label={localize('com_nav_balance_just_refilled')}
          className="mt-0.5 inline-block font-medium text-green-600 dark:text-green-400"
        >
          ({formatRefillAmount(refillAmount)})
        </TooltipAnchor>
      )}
      {nextRefillLabel !== null && (
        <div className="text-token-text-tertiary mt-0.5 text-xs">{nextRefillLabel}</div>
      )}
    </div>
  );
}

function AccountSettings({ collapsed = false }: { collapsed?: boolean }) {
  const localize = useLocalize();
  const { user, isAuthenticated, logout } = useAuthContext();
  const { data: startupConfig } = useGetStartupConfig();
  const balanceQuery = useGetUserBalance({
    enabled: !!isAuthenticated && startupConfig?.balance?.enabled,
  });
  const [showSettings, setShowSettings] = useState(false);
  const [showFiles, setShowFiles] = useState(false);
  const accountSettingsButtonRef = useRef<HTMLButtonElement>(null);

  return (
    <Menu.MenuProvider>
      <Menu.MenuButton
        ref={accountSettingsButtonRef}
        aria-label={localize('com_nav_account_settings')}
        data-testid="nav-user"
        className={
          collapsed
            ? 'flex h-9 w-9 items-center justify-center rounded-lg transition-colors hover:bg-surface-active-alt aria-[expanded=true]:bg-surface-active-alt'
            : 'mt-text-sm flex h-auto w-full items-center gap-2 rounded-xl p-2 text-sm transition-all duration-200 ease-in-out hover:bg-surface-active-alt aria-[expanded=true]:bg-surface-active-alt'
        }
      >
        <div
          className={collapsed ? 'size-7 flex-shrink-0' : '-ml-0.9 -mt-0.8 h-8 w-8 flex-shrink-0'}
        >
          <div className="relative flex">
            <Avatar user={user} size={collapsed ? 28 : 32} />
          </div>
        </div>
        {!collapsed && (
          <div
            className="mt-2 grow overflow-hidden text-ellipsis whitespace-nowrap text-left text-text-primary"
            style={{ marginTop: '0', marginLeft: '0' }}
          >
            {user?.name ?? user?.username ?? localize('com_nav_user')}
          </div>
        )}
      </Menu.MenuButton>
      <Menu.Menu
        portal
        className="account-settings-popover popover-ui z-[125] w-[305px] rounded-lg md:w-[244px]"
        placement={collapsed ? 'right-end' : undefined}
        style={{
          transformOrigin: collapsed ? 'left bottom' : 'bottom',
          translate: collapsed ? '4px 0' : '0 -4px',
        }}
      >
        <div className="text-token-text-secondary ml-3 mr-2 py-2 text-sm" role="note">
          {user?.email ?? localize('com_nav_user')}
        </div>
        <DropdownMenuSeparator />
        {startupConfig?.balance?.enabled === true && balanceQuery.data != null && (
          <>
            <BalanceMenuItem data={balanceQuery.data} />
            <DropdownMenuSeparator />
          </>
        )}
        <Menu.MenuItem onClick={() => setShowFiles(true)} className="select-item text-sm">
          <FileText className="icon-md" aria-hidden="true" />
          {localize('com_nav_my_files')}
        </Menu.MenuItem>
        {startupConfig?.helpAndFaqURL !== '/' && (
          <Menu.MenuItem
            onClick={() => window.open(startupConfig?.helpAndFaqURL, '_blank')}
            className="select-item text-sm"
          >
            <LinkIcon aria-hidden="true" />
            {localize('com_nav_help_faq')}
          </Menu.MenuItem>
        )}
        <Menu.MenuItem onClick={() => setShowSettings(true)} className="select-item text-sm">
          <GearIcon className="icon-md" aria-hidden="true" />
          {localize('com_nav_settings')}
        </Menu.MenuItem>
        <DropdownMenuSeparator />
        <Menu.MenuItem onClick={() => logout()} className="select-item text-sm">
          <LogOut className="icon-md" aria-hidden="true" />
          {localize('com_nav_log_out')}
        </Menu.MenuItem>
      </Menu.Menu>
      {showFiles && (
        <MyFilesModal
          open={showFiles}
          onOpenChange={setShowFiles}
          triggerRef={accountSettingsButtonRef}
        />
      )}
      {showSettings && <Settings open={showSettings} onOpenChange={setShowSettings} />}
    </Menu.MenuProvider>
  );
}

export default memo(AccountSettings);
