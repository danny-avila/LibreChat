import { useState, memo } from 'react';
import { useRecoilState } from 'recoil';
import * as Select from '@ariakit/react/select';
import { FileText, LogOut } from 'lucide-react';
import { LinkIcon, GearIcon, DropdownMenuSeparator, Avatar } from '@librechat/client';
import { useGetStartupConfig, useGetUserBalance } from '~/data-provider';
import FilesView from '~/components/Chat/Input/Files/FilesView';
import { useAuthContext } from '~/hooks';
import { useLocalize } from '~/hooks';
import Settings from './Settings';
import  SubscriptionDialog from '~/components/Subscription/SubscriptionDialog'
import store from '~/store';
import { useGetFileConfig } from '~/data-provider/Files/queries';

function AccountSettings() {
  const localize = useLocalize();
  const { user, isAuthenticated, logout } = useAuthContext();
  const { data: startupConfig } = useGetStartupConfig();
  const balanceQuery = useGetUserBalance({
    enabled: !!isAuthenticated && startupConfig?.balance?.enabled,
  });
  const [showSettings, setShowSettings] = useState(false);
  const [showFiles, setShowFiles] = useRecoilState(store.showFiles);
  const [showSubscriptionDialog, setShowSubscriptionDialog] = useState(false);

  const fileAttachRequiresSubscription = startupConfig?.fileAttachRequiresSubscription;
  const hasSubscription = user?.subscriptionStatus === 'active';

  const handleClick = () => {
    if (fileAttachRequiresSubscription && !hasSubscription) {
      setShowSubscriptionDialog(true);
      return;
    }

    setShowFiles(true); 
  };

  return (
    <Select.SelectProvider>
      <Select.Select
        aria-label={localize('com_nav_account_settings')}
        data-testid="nav-user"
        className="mt-text-sm flex h-auto w-full items-center gap-2 rounded-xl p-2 text-sm transition-all duration-200 ease-in-out hover:bg-surface-hover"
      >
        <div className="-ml-0.9 -mt-0.8 h-8 w-8 flex-shrink-0">
          <div className="relative flex">
            <Avatar user={user} size={32} />
          </div>
        </div>
        <div
          className="mt-2 grow overflow-hidden text-ellipsis whitespace-nowrap text-left text-text-primary"
          style={{ marginTop: '0', marginLeft: '0' }}
        >
          {user?.name ?? user?.username ?? localize('com_nav_user')}
        </div>
      </Select.Select>
      <Select.SelectPopover
        className="popover-ui w-[235px]"
        style={{
          transformOrigin: 'bottom',
          marginRight: '0px',
          translate: '0px',
        }}
      >
        <div className="text-token-text-secondary ml-3 mr-2 py-2 text-sm" role="note">
          {user?.email ?? localize('com_nav_user')}
        </div>
        <DropdownMenuSeparator />
        {startupConfig?.balance?.enabled === true && balanceQuery.data != null && (
          <>
            <div className="text-token-text-secondary ml-3 mr-2 py-2 text-sm" role="note">
              {localize('com_nav_balance')}:{' '}
              {new Intl.NumberFormat().format(Math.round(balanceQuery.data.tokenCredits))}
            </div>
            <DropdownMenuSeparator />
          </>
        )}
        {(startupConfig?.hideUserFiles !== true) && (
        <Select.SelectItem
          value=""
          onClick={() => handleClick()}
          className="select-item text-sm"
        >
          <FileText className="icon-md" aria-hidden="true" />
          {localize('com_nav_my_files')}
        </Select.SelectItem>
        )}
        {startupConfig?.helpAndFaqURL !== '/' && (
          <Select.SelectItem
            value=""
            onClick={() => window.open(startupConfig?.helpAndFaqURL, '_blank')}
            className="select-item text-sm"
          >
            <LinkIcon aria-hidden="true" />
            {localize('com_nav_help_faq')}
          </Select.SelectItem>
        )}
        <Select.SelectItem
          value=""
          onClick={() => setShowSettings(true)}
          className="select-item text-sm"
        >
          <GearIcon className="icon-md" aria-hidden="true" />
          {localize('com_nav_settings')}
        </Select.SelectItem>
        <DropdownMenuSeparator />
        <Select.SelectItem
          aria-selected={true}
          onClick={() => logout()}
          value="logout"
          className="select-item text-sm"
        >
          <LogOut className="icon-md" />
          {localize('com_nav_log_out')}
        </Select.SelectItem>
      </Select.SelectPopover>
      {/* {showSubscriptionDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
          <div className="bg-white dark:bg-surface-primary rounded-lg p-6 shadow-xl flex flex-col gap-4 min-w-[300px]">
            <div className="text-lg font-semibold">Subscription Required</div>
            <div>You need an active subscription to upload files. Please subscribe to unlock this feature.</div>
            <div className="flex gap-4 justify-end mt-2">
              <button
                className="px-4 py-2 rounded bg-primary text-white font-medium hover:bg-primary-dark"
                onClick={() => setShowSubscriptionDialog(false)}
              >
                Close
              </button>
              <a
                href="/account/subscription"
                className="px-4 py-2 rounded bg-surface-secondary text-text-primary font-medium hover:bg-surface-tertiary border border-primary"
              >
                View Plans
              </a>
            </div>
          </div>
        </div>
      )}       */}
      {showFiles && <FilesView open={showFiles} onOpenChange={setShowFiles} />}
      {showSettings && <Settings open={showSettings} onOpenChange={setShowSettings} />}
      {showSubscriptionDialog && <SubscriptionDialog open={showSubscriptionDialog} onOpenChange={setShowSubscriptionDialog} />}
    </Select.SelectProvider>
  );
}

export default memo(AccountSettings);
