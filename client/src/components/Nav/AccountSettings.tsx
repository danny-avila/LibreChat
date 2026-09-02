import { useState, memo, useRef } from 'react';
import { useSetRecoilState } from 'recoil';
import * as Menu from '@ariakit/react/menu';
import { getRefillEligibilityDate } from 'librechat-data-provider';
import { GearIcon, DropdownMenuSeparator, Avatar, TooltipAnchor } from '@librechat/client';
import {
  Archive,
  ChevronRight,
  CircleHelp,
  Keyboard,
  LifeBuoy,
  LogOut,
  Scale,
  ShieldCheck,
} from 'lucide-react';
import type { TBalanceResponse } from 'librechat-data-provider';
import { ArchivedChatsModal } from '~/components/Nav/SettingsTabs/General/ArchivedChatsModal';
import { useGetStartupConfig, useGetUserBalance } from '~/data-provider';
import { useAuthContext } from '~/hooks/AuthContext';
import { useLocalize } from '~/hooks';
import Settings from './Settings';
import store from '~/store';

function HelpSubmenu({
  helpAndFaqURL,
  termsOfServiceURL,
  privacyPolicyURL,
  onShowShortcuts,
}: {
  helpAndFaqURL?: string;
  termsOfServiceURL?: string;
  privacyPolicyURL?: string;
  onShowShortcuts: () => void;
}) {
  const localize = useLocalize();
  const hasHelpFaq = !!helpAndFaqURL && helpAndFaqURL !== '/';
  const hasTos = !!termsOfServiceURL;
  const hasPrivacy = !!privacyPolicyURL;
  const showLegalDivider = (hasHelpFaq || true) && (hasTos || hasPrivacy);

  return (
    <Menu.MenuProvider placement="right-start">
      <Menu.MenuItem
        hideOnClick={false}
        render={
          <Menu.MenuButton className="select-item flex w-full cursor-pointer items-center gap-2 text-sm" />
        }
      >
        <CircleHelp className="icon-md" aria-hidden="true" />
        <span className="flex-1 text-left">{localize('com_nav_help')}</span>
        <ChevronRight className="h-4 w-4 text-text-secondary" aria-hidden="true" />
      </Menu.MenuItem>
      <Menu.Menu
        portal
        gutter={12}
        className="account-settings-popover popover-ui popover-from-left z-[126] w-[244px] rounded-lg"
      >
        {hasHelpFaq && (
          <Menu.MenuItem
            onClick={() => window.open(helpAndFaqURL, '_blank', 'noopener,noreferrer')}
            className="select-item text-sm"
          >
            <LifeBuoy className="icon-md" aria-hidden="true" />
            {localize('com_nav_help_faq')}
          </Menu.MenuItem>
        )}
        <Menu.MenuItem onClick={onShowShortcuts} className="select-item text-sm">
          <Keyboard className="icon-md" aria-hidden="true" />
          {localize('com_shortcut_keyboard_shortcuts')}
        </Menu.MenuItem>
        {showLegalDivider && (hasTos || hasPrivacy) && <DropdownMenuSeparator />}
        {hasTos && (
          <Menu.MenuItem
            onClick={() => window.open(termsOfServiceURL, '_blank', 'noopener,noreferrer')}
            className="select-item text-sm"
          >
            <Scale className="icon-md" aria-hidden="true" />
            {localize('com_ui_terms_of_service')}
          </Menu.MenuItem>
        )}
        {hasPrivacy && (
          <Menu.MenuItem
            onClick={() => window.open(privacyPolicyURL, '_blank', 'noopener,noreferrer')}
            className="select-item text-sm"
          >
            <ShieldCheck className="icon-md" aria-hidden="true" />
            {localize('com_ui_privacy_policy')}
          </Menu.MenuItem>
        )}
      </Menu.Menu>
    </Menu.MenuProvider>
  );
}

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

  const refillConfigured =
    autoRefillEnabled === true && typeof refillAmount === 'number' && refillAmount > 0;

  const eligibilityDate =
    refillConfigured &&
    validLastRefill !== null &&
    typeof refillIntervalValue === 'number' &&
    refillIntervalUnit !== undefined
      ? getRefillEligibilityDate(validLastRefill, refillIntervalValue, refillIntervalUnit)
      : null;

  const refillAvailable =
    refillConfigured &&
    (validLastRefill === null || Date.now() >= (eligibilityDate?.getTime() ?? 0));

  const showAvailableBadge = refillAvailable && tokenCredits > 0;
  const showNextRefillSubtext =
    !refillAvailable &&
    tokenCredits <= 0 &&
    eligibilityDate !== null &&
    eligibilityDate.getTime() > Date.now();

  return (
    <div className="text-token-text-secondary ml-3 mr-2 py-2 text-sm" role="note">
      <div>
        {localize('com_nav_balance')}: {formattedBalance}
      </div>
      {showAvailableBadge && typeof refillAmount === 'number' && (
        <TooltipAnchor
          side="right"
          description={localize('com_nav_balance_refill_available_info')}
          aria-label={localize('com_nav_balance_refill_available')}
          className="mt-0.5 inline-block font-medium text-green-600 dark:text-green-400"
        >
          ({formatRefillAmount(refillAmount)})
        </TooltipAnchor>
      )}
      {showNextRefillSubtext && eligibilityDate !== null && (
        <div className="text-token-text-tertiary mt-0.5 text-xs">
          {localize('com_nav_balance_next_refill_in', {
            0: formatTimeUntil(eligibilityDate),
          })}
        </div>
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
  const setShowShortcutsDialog = useSetRecoilState(store.showShortcutsDialog);
  const [showArchived, setShowArchived] = useState(false);
  const accountSettingsButtonRef = useRef<HTMLButtonElement>(null);

  return (
    <Menu.MenuProvider placement={collapsed ? 'right-end' : undefined}>
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
        <HelpSubmenu
          helpAndFaqURL={startupConfig?.helpAndFaqURL}
          termsOfServiceURL={startupConfig?.interface?.termsOfService?.externalUrl}
          privacyPolicyURL={startupConfig?.interface?.privacyPolicy?.externalUrl}
          onShowShortcuts={() => setShowShortcutsDialog(true)}
        />
        <Menu.MenuItem onClick={() => setShowArchived(true)} className="select-item text-sm">
          <Archive className="icon-md" aria-hidden="true" />
          {localize('com_nav_archived_chats')}
        </Menu.MenuItem>
        <Menu.MenuItem
          onClick={() => setShowSettings(true)}
          className="select-item text-sm"
          data-testid="nav-settings"
        >
          <GearIcon className="icon-md" aria-hidden="true" />
          {localize('com_nav_settings')}
        </Menu.MenuItem>
        <DropdownMenuSeparator />
        <Menu.MenuItem onClick={() => logout()} className="select-item text-sm">
          <LogOut className="icon-md" aria-hidden="true" />
          {localize('com_nav_log_out')}
        </Menu.MenuItem>
      </Menu.Menu>
      {showArchived && (
        <ArchivedChatsModal
          open={showArchived}
          onOpenChange={setShowArchived}
          triggerRef={accountSettingsButtonRef}
        />
      )}
      {showSettings && <Settings open={showSettings} onOpenChange={setShowSettings} />}
    </Menu.MenuProvider>
  );
}

export default memo(AccountSettings);
